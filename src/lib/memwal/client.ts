/**
 * MemWal Client — server-side only (Next.js API Routes)
 *
 * MemWal stores memories keyed by a "namespace". We use the user's Sui wallet
 * address as the namespace so every user gets their own isolated memory bucket.
 *
 * The MCP server exposes tools via HTTP at MEMWAL_API_URL (defaults to
 * http://localhost:3100 when running locally). On Vercel you would replace this
 * with a real hosted MemWal API endpoint + API key.
 */

const MEMWAL_API_URL = process.env.MEMWAL_API_URL ?? 'http://localhost:3100';
const MEMWAL_API_KEY = process.env.MEMWAL_API_KEY ?? '';

interface MemwalRecallResult {
  id: string;
  text: string;
  score: number;
  written: string;
  namespace: string;
}

/** Pull relevant memories for a given Sui address */
export async function memwalRecall(
  userId: string,
  query: string,
  limit = 10,
): Promise<string> {
  try {
    const res = await fetch(`${MEMWAL_API_URL}/recall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MEMWAL_API_KEY ? { Authorization: `Bearer ${MEMWAL_API_KEY}` } : {}),
      },
      body: JSON.stringify({ query, namespace: userId, limit }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.warn(`[MemWal] recall failed: HTTP ${res.status}`);
      return '';
    }

    const json: { results?: MemwalRecallResult[] } = await res.json();
    const results = json.results ?? [];

    if (results.length === 0) return '';

    // Format as readable context for the system prompt
    return results
      .map((r) => `• [${r.written}] ${r.text}`)
      .join('\n');
  } catch (err) {
    console.error('[MemWal] recall error:', err);
    return '';
  }
}

/** Save a new fact for a given Sui address (fire-and-forget) */
export async function memwalRemember(userId: string, text: string): Promise<void> {
  try {
    const res = await fetch(`${MEMWAL_API_URL}/remember`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MEMWAL_API_KEY ? { Authorization: `Bearer ${MEMWAL_API_KEY}` } : {}),
      },
      body: JSON.stringify({ text, namespace: userId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[MemWal] remember failed: HTTP ${res.status}`);
    } else {
      console.log(`[MemWal] ✓ saved memory for ${userId.slice(0, 8)}…`);
    }
  } catch (err) {
    console.error('[MemWal] remember error:', err);
  }
}
