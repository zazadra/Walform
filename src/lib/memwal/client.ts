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

const MEMWAL_SERVER_URL = process.env.MEMWAL_SERVER_URL ?? 'https://relayer.memory.walrus.xyz';
const MEMWAL_ACCOUNT_ID = process.env.MEMWAL_ACCOUNT_ID ?? '';
const MEMWAL_PRIVATE_KEY = process.env.MEMWAL_PRIVATE_KEY ?? '';

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
    const res = await fetch(`${MEMWAL_SERVER_URL}/v1/recall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MEMWAL_PRIVATE_KEY}`,
        'x-account-id': MEMWAL_ACCOUNT_ID,
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
    const res = await fetch(`${MEMWAL_SERVER_URL}/v1/remember`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MEMWAL_PRIVATE_KEY}`,
        'x-account-id': MEMWAL_ACCOUNT_ID,
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
