/**
 * GET /api/chat/greet?userId=0x...
 * 
 * Called when the ChatWidget opens — fetches memories and returns
 * a personalized greeting message based on past conversations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { memwalRecall } from '@/lib/memwal/client';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') ?? 'anonymous';

  try {
    // Recall profile facts
    const memories = await memwalRecall(userId, 'nama user, preferensi, alias, identitas', 3);

    if (!memories) {
      return NextResponse.json({
        greeting: "Hey! 👋 I'm Walbot, your Walform AI assistant. Ask me anything about Walform, Walrus Protocol, or the Sui ecosystem!",
        hasMemory: false,
      });
    }

    // Extract a name if it exists in memories
    const nameMatch = memories.match(/(?:named?|called?|alias|panggi(?:l|lan))\s+([A-Za-z0-9_\-]+)/i);
    const name = nameMatch ? nameMatch[1] : null;

    const greeting = name
      ? `Welcome back, ${name}! 👋 Great to see you again. How can I help you with Walform today?`
      : `Welcome back! 👋 I remember you from our last chat. How can I help you today?`;

    return NextResponse.json({ greeting, hasMemory: true });
  } catch (e) {
    return NextResponse.json({
      greeting: "Hey! 👋 I'm Walbot, your Walform AI assistant. Ask me anything!",
      hasMemory: false,
    });
  }
}
