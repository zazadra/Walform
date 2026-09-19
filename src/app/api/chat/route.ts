/**
 * POST /api/chat
 *
 * Body: { userId: string; messages: { role: 'user'|'model'; content: string }[] }
 *
 * Flow:
 *   1. Recall relevant memories from MemWal (by Sui address)
 *   2. Build system prompt with injected memory + Sui knowledge base
 *   3. Send conversation to Gemini
 *   3. Send conversation to OpenRouter API
 *   4. Extract <memwal>...</memwal> tags from response
 *   5. Save new facts to MemWal
 *   6. Return clean reply to frontend
 */

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
    const memoryContext = await memwalRecall(userId, latestMessage, 5);

    // ── 2. Construct System Instruction ────────────────────────────
    const systemInstruction = `Kamu adalah Walbot, Customer Service AI cerdas untuk Walform.
Walform adalah platform pembuat formulir Web3 yang terintegrasi dengan Walrus Session 2.
Kamu sangat tahu tentang ekosistem Sui, Walrus Protocol, Walform, dan teknologi MemWal.
Gunakan bahasa Indonesia yang ramah, asyik, dan profesional.
Selalu ingat siapa user yang mengajakmu bicara jika ada data memori.

Berikut adalah memori masa lalu dari user ini yang bisa kamu gunakan sebagai konteks:
--- MEMORI USER MULAI ---
${memoryContext || 'Belum ada memori untuk user ini.'}
--- MEMORI USER SELESAI ---

PENTING: Jika di dalam percakapan ini user menyebutkan fakta baru tentang dirinya (misal namanya, preferensinya, kebutuhannya), atau informasi yang menurutmu penting untuk diingat untuk masa depan, kamu WAJIB membungkus fakta tersebut di dalam tag <memwal></memwal> di akhir balasanmu. 
Contoh: "Baik Mas Budi, saya catat ya! <memwal>User bernama Budi dan sedang membuat form untuk hackathon</memwal>"`;

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

    // ── 5. Extract MemWal Tags ─────────────────────────────────────
    const { clean: reply, facts } = extractMemoryTags(rawReply);

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
