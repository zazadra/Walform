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
    const body = await req.json() as { userId?: string; messages?: ChatMessage[] };
    const { userId = 'anonymous', messages = [] } = body;

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

    // ── 3. Build Messages Array for OpenRouter ──────────────────────
    // Map 'model' to 'assistant' for OpenAI compatibility
    const openRouterMessages = messages.slice(0, -1).map((m) => ({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.content,
    }));

    const promptWithMemories = `Konteks memori tambahan:\n${memoryContext}\n\nPesan User:\n${latestMessage}`;

    openRouterMessages.push({
      role: 'user',
      content: promptWithMemories,
    });

    const payload = {
      model: 'inclusionai/ling-3.0-flash-vl:free',
      messages: [
        { role: 'system', content: systemInstruction },
        ...openRouterMessages
      ]
    };

    // ── 4. Call OpenRouter API ───────────────────────────────────────
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY tidak dikonfigurasi di server.');
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
      throw new Error(`OpenRouter Error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const rawReply = result.choices?.[0]?.message?.content || '';

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
