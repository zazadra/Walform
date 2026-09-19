/**
 * POST /api/chat
 *
 * Body: { userId: string; messages: { role: 'user'|'model'; content: string }[] }
 *
 * Flow:
 *   1. Recall relevant memories from MemWal (by Sui address)
 *   2. Build system prompt with injected memory + Sui knowledge base
 *   3. Send conversation to Gemini
 *   4. Extract [SAVE_MEMORY: ...] tags from response
 *   5. Fire-and-forget memory saves to MemWal
 *   6. Return clean reply to frontend
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { memwalRecall, memwalRemember } from '@/lib/memwal/client';
import { buildSystemPrompt, extractMemoryTags } from '@/lib/walbot-prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

type ChatMessage = { role: 'user' | 'model'; content: string };

export async function POST(req: NextRequest) {
  try {
    // ── 0. Parse body ──────────────────────────────────────────────
    const body = await req.json() as { userId?: string; messages?: ChatMessage[] };
    const userId: string = body.userId ?? 'anonymous';
    const messages: ChatMessage[] = body.messages ?? [];

    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages array is empty' }, { status: 400 });
    }

    const latestMessage = messages[messages.length - 1].content;

    // ── 1. Recall memory from MemWal ───────────────────────────────
    const memoryContext = await memwalRecall(userId, latestMessage, 10);

    // ── 2. Build system prompt ─────────────────────────────────────
    const systemInstruction = buildSystemPrompt(memoryContext);

    // ── 3. Initialize Gemini model ─────────────────────────────────
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',   // Using flash which is faster and guaranteed to be available
      systemInstruction,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    // Build history (all messages except the latest)
    let rawHistory = messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

    // Gemini API strict rule: history must start with 'user' and strictly alternate
    const history = [];
    let expectedRole = 'user';
    for (let i = 0; i < rawHistory.length; i++) {
      if (rawHistory[i].role === expectedRole) {
        history.push(rawHistory[i]);
        expectedRole = expectedRole === 'user' ? 'model' : 'user';
      }
    }

    // ── 4. Send to Gemini ──────────────────────────────────────────
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(latestMessage);
    const rawReply = result.response.text();

    // ── 5. Extract & fire-and-forget memory saves ──────────────────
    const { clean: reply, facts } = extractMemoryTags(rawReply);

    if (facts.length > 0) {
      // Don't await — run in background so user gets their response immediately
      Promise.all(
        facts.map((fact) => memwalRemember(userId, fact))
      ).catch((err) => console.error('[Chat] background memory save failed:', err));
    }

    // ── 6. Return clean reply ──────────────────────────────────────
    return NextResponse.json({ reply });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Chat API] Error:', msg);
    return NextResponse.json({ error: 'Gagal memproses pesan', detail: msg }, { status: 500 });
  }
}
