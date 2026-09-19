import { NextRequest, NextResponse } from 'next/server';
import { memwalRecall, memwalRemember } from '@/lib/memwal/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string; messages?: ChatMessage[]; provider?: string; userOpenRouterKey?: string; userOpenRouterModel?: string };
    const { userId = 'anonymous', messages = [], userOpenRouterKey, userOpenRouterModel } = body;

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Pesan kosong' }, { status: 400 });
    }

    const latestMessage = messages[messages.length - 1].content;

    // ── 1. Recall from MemWal ──────────────────────────────────────
    // Gunakan query yang lebih luas agar informasi profil (nama, dsb) selalu ikut terpanggil
    // meskipun user hanya mengetik "halo"
    const memoryQuery = `Profil user, nama, identitas, preferensi. Obrolan saat ini: ${latestMessage}`;
    const memoryContext = await memwalRecall(userId, memoryQuery, 5);

    // ── 2. Construct System Instruction ────────────────────────────
    const systemInstruction = `Kamu adalah Walbot, Customer Service AI cerdas untuk Walform.
    
**TENTANG WALFORM & EKOSISTEM**:
- **Walform**: Platform pembuat formulir Web3 alternatif Google Forms. Diciptakan pertama kali pada kompetisi "Walrus Session 2".
- **Walbot**: Kamu adalah Walbot. Kamu ditambahkan ke dalam Walform khusus untuk kompetisi "Walrus Session 8: Chatbots That Remember".
- **Sui Ecosystem**: Blockchain Layer-1 yang sangat cepat, aman, dan berbiaya rendah.
- **Login**: Pengguna login murni menggunakan wallet Web3 bernama **Slush**.
- **Penyimpanan**: 
  - Data formulir disimpan secara terdesentralisasi menggunakan **Walrus Protocol**.
  - **MemWal** HANYA digunakan olehmu (Walbot) untuk mengingat profil, preferensi, dan riwayat obrolan pengguna agar obrolan terasa personal. Jangan tertukar antara Walrus (untuk form) dan MemWal (untuk memori AI).

**INFORMASI PENGGUNA SAAT INI**:
- **Alamat Wallet (ID) Pengguna yang sedang berbicara denganmu:** ${userId}
- Kamu tidak perlu menanyakan alamat wallet mereka karena sistem sudah mendeteksinya secara otomatis.

**PANDUAN KOMUNIKASI**:
- Boleh menggunakan emoji, enter/baris baru, dan Markdown (seperti **tebal**) agar teks lebih mudah dibaca. Buat paragraf pendek.
- **DEFAULT LANGUAGE IS ENGLISH.** Selalu gunakan bahasa Inggris secara default. HANYA gunakan bahasa lain (seperti Indonesia) JIKA pengguna lebih dulu menggunakan bahasa tersebut.
- Selalu ingat siapa user yang mengajakmu bicara menggunakan data memori di bawah ini.

Berikut adalah memori masa lalu dari user ini yang bisa kamu gunakan sebagai konteks:
--- MEMORI USER MULAI ---
${memoryContext || 'Belum ada memori untuk user ini.'}
--- MEMORI USER SELESAI ---

PENTING UNTUK MENGINGAT: 
Sistem akan melupakan percakapan saat halaman di-refresh. Oleh karena itu, kamu WAJIB menggunakan tag <memwal></memwal> di akhir balasanmu untuk mengingat dua hal:
1. Fakta baru tentang user (nama, preferensi, kebutuhan).
2. Ringkasan topik yang sedang kalian bahas saat ini (agar kamu bisa melanjutkannya nanti jika terputus).

Contoh penggunaan:
"Sure, I will remember that! <memwal>User is named Budi. We are currently discussing how to build a payment form.</memwal>"`;

    // ── 3. Normalize Messages (Strict Alternating Pattern) ─────────
    const normalizedRawMessages: any[] = [];
    // We ignore the very last message in the loop because we process it specially with memory context below
    const historyMessages = messages.slice(0, -1);
    
    for (let i = 0; i < historyMessages.length; i++) {
      const msg = historyMessages[i];
      if (normalizedRawMessages.length === 0) {
        if (msg.role !== 'user') continue; // First history message must be from user
        normalizedRawMessages.push(msg);
      } else {
        const lastRole = normalizedRawMessages[normalizedRawMessages.length - 1].role;
        if (msg.role !== lastRole) {
          normalizedRawMessages.push(msg);
        } else {
          normalizedRawMessages[normalizedRawMessages.length - 1].content += '\n\n' + msg.content;
        }
      }
    }

    const promptWithMemories = `Konteks memori tambahan:\n${memoryContext}\n\nPesan User:\n${latestMessage}`;
    normalizedRawMessages.push({ role: 'user', content: promptWithMemories });

    // ── 4. Call Selected AI Provider ───────────────────────────────
    let rawReply = '';
    const provider = body.provider || 'openrouter';

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing in backend.");

      const geminiMessages = normalizedRawMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // Gemini REST API — use the requested gemini-3.6-flash model
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: geminiMessages
        })
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error('[Gemini Error]', geminiRes.status, errText);
        if (geminiRes.status === 429) throw new Error('RATE_LIMIT_EXCEEDED');
        // Surface the real error message for debugging
        throw new Error(`GEMINI_ERROR:${geminiRes.status}:${errText}`);
      }
      const data = await geminiRes.json();
      rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'groq') {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("GROQ_API_KEY is missing in backend.");

      const groqMessages = normalizedRawMessages.map((m) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      }));

      const payload = {
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemInstruction },
          ...groqMessages
        ]
      };

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error('[Groq Error]', groqRes.status, errText);
        if (groqRes.status === 429) throw new Error('RATE_LIMIT_EXCEEDED');
        throw new Error(`GROQ_ERROR:${groqRes.status}:${errText}`);
      }
      const data = await groqRes.json();
      rawReply = data.choices?.[0]?.message?.content || '';
    } else {
      // ── OpenRouter ──────────────────────
      const openRouterMessages = normalizedRawMessages.map((m) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      }));

      const payload = {
        model: userOpenRouterModel || 'inclusionai/ling-3.0-flash-vl:free',
        messages: [
          { role: 'system', content: systemInstruction },
          ...openRouterMessages
        ]
      };

      const openRouterApiKey = userOpenRouterKey || process.env.OPENROUTER_API_KEY;
      if (!openRouterApiKey) {
        throw new Error('No OpenRouter API key available.');
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://walform.vercel.app',
          'X-Title': 'Walform Chatbot'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          throw new Error('RATE_LIMIT_EXCEEDED');
        }
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      rawReply = result.choices?.[0]?.message?.content || '';
    }

    // ── 5. Extract MemWal Tags & Cleanup Markdown ──────────────────
    let { clean: reply, facts } = extractMemoryTags(rawReply);

    // ── 6. Save new facts to MemWal ────────────────────────────────
    for (const fact of facts) {
      if (fact.trim()) {
        await memwalRemember(userId, fact.trim());
      }
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('[Chat API] Error:', msg);
    return NextResponse.json({ error: 'Gagal memproses pesan', detail: msg }, { status: 500 });
  }
}

/** Utility to extract <memwal>...</memwal> tags */
function extractMemoryTags(text: string): { clean: string; facts: string[] } {
  const regex = /<memwal>([\s\S]*?)<\/memwal>/gi;
  let match;
  const facts: string[] = [];
  let clean = text;

  while ((match = regex.exec(text)) !== null) {
    facts.push(match[1]);
  }

  clean = clean.replace(regex, '').trim();
  return { clean, facts };
}
