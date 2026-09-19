/**
 * MemWal client — uses the official @mysten-incubation/memwal SDK
 * https://docs.memory.walrus.xyz
 *
 * Env vars (set in Vercel + .env.local):
 *   MEMWAL_PRIVATE_KEY  — delegate private key from memory.walrus.xyz dashboard
 *   MEMWAL_ACCOUNT_ID   — your account ID (0x...)
 *   MEMWAL_SERVER_URL   — https://relayer.memory.walrus.xyz
 */

import { MemWal } from '@mysten-incubation/memwal';

function getClient() {
  const key = process.env.MEMWAL_PRIVATE_KEY ?? '';
  const accountId = process.env.MEMWAL_ACCOUNT_ID ?? '';
  const serverUrl = process.env.MEMWAL_SERVER_URL ?? 'https://relayer.memory.walrus.xyz';

  if (!key || !accountId) {
    throw new Error('MemWal: MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID must be set.');
  }

  return MemWal.create({ key, accountId, serverUrl });
}

/**
 * Recall relevant memories for a user namespace (Sui address).
 * Returns a plain text block, or empty string on failure.
 */
export async function memwalRecall(
  userId: string,
  query: string,
  limit = 5,
): Promise<string> {
  try {
    const memwal = getClient();
    const result = await memwal.recall({ query, namespace: userId, limit });

    if (!result?.results?.length) return '';

    return result.results
      .map((r: { text: string; score?: number }) => r.text)
      .join('\n');
  } catch (err) {
    console.error('[MemWal] recall error:', err);
    return '';
  }
}

/**
 * Save a new memory fact for a user namespace (fire-and-forget friendly).
 */
export async function memwalRemember(userId: string, text: string): Promise<void> {
  try {
    const memwal = getClient();
    const job = await memwal.remember(text, { namespace: userId });
    // wait for confirmation (non-blocking from caller's perspective via await)
    if (job?.job_id) {
      await memwal.waitForRememberJob(job.job_id);
    }
  } catch (err) {
    console.error('[MemWal] remember error:', err);
  }
}
