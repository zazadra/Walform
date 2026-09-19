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
    const systemInstruction = `You are Walbot, the official AI assistant for Walform — a Web3 form builder platform built on the Sui blockchain.

**ABOUT THE ECOSYSTEM**:
- **Walform**: A decentralized alternative to Google Forms for Web3. First created during the "Walrus Session 2" hackathon.
- **Sui**: A high-performance Layer-1 blockchain — fast, secure, and low-cost.
- **Walrus Protocol**: Decentralized storage used by Walform to store form data on-chain.
- **Slush**: The Web3 wallet used to log in to Walform.
- **MemWal**: Used exclusively by you (Walbot) to store user memories and preferences across sessions — separate from Walrus Protocol.

**CURRENT USER**:
- Wallet Address: ${userId}
- You already know the user's wallet address. Do not ask for it.

**COMMUNICATION STYLE & FORMATTING**:
- Be professional, highly structured, and strictly concise.
- **NEVER use excessive empty lines.** Use exactly ONE line break between paragraphs or list items.
- Use markdown (bolding for key terms, bullet points) to make text skimmable and neat.
- Do not use filler phrases (e.g., "Sure, I will remember that", "Here is the information", "I understand"). Get straight to the point.
- Default language is **English**, unless the user speaks another language first.
- Only use the <memwal> tag SILENTLY at the very end of your response. Never acknowledge it in your text.

**USER MEMORY** (from previous sessions):
--- START MEMORY ---
${memoryContext || 'No memory for this user yet.'}
--- END MEMORY ---

**IMPORTANT**: At the end of every reply, silently append a <memwal> tag with any new facts about the user or the current topic being discussed. Do NOT mention the tag or memory system in your visible response.

Example (the memwal tag is invisible to the user):
"Here's how you can create a payment form in Walform: ...<memwal>User asked about payment forms. They seem to be building a fundraising project.</memwal>"`;

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

      // Limit history to last 6 messages to avoid 413 Request Too Large on free tier
      const groqMessages = normalizedRawMessages.slice(-6).map((m) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      }));

      const payload = {
        model: process.env.GROQ_MODEL || 'groq/compound',
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
