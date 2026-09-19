/**
 * MemWal client — uses the official @mysten-incubation/memwal SDK
 * Docs: https://docs.memory.walrus.xyz
 *
 * Env vars:
 *   MEMWAL_PRIVATE_KEY  — delegate private key
 *   MEMWAL_ACCOUNT_ID   — account object ID (0x...)
 *   MEMWAL_SERVER_URL   — https://relayer.memory.walrus.xyz
 */

import { MemWal } from '@mysten-incubation/memwal';

let _client: MemWal | null = null;

function getClient(): MemWal {
  if (_client) return _client;

  const key = process.env.MEMWAL_PRIVATE_KEY ?? '';
  const accountId = process.env.MEMWAL_ACCOUNT_ID ?? '';
  const serverUrl = process.env.MEMWAL_SERVER_URL ?? 'https://relayer.memory.walrus.xyz';

  if (!key || !accountId) {
    throw new Error('MemWal: MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID must be set.');
  }

  _client = MemWal.create({ key, accountId, serverUrl });
  return _client;
}

/**
 * Recall relevant memories for a user (keyed by Sui wallet address as namespace).
 * Returns plain text block, or empty string on failure.
 */
export async function memwalRecall(
  userId: string,
  query: string,
  limit = 5,
): Promise<string> {
  try {
    const memwal = getClient();
    // Use the correct object-style call with namespace
    const result = await memwal.recall({ query, namespace: userId, limit });

    if (!result?.results?.length) return '';

    return result.results
      .map((r: { text: string }) => r.text)
      .join('\n');
  } catch (err) {
    console.error('[MemWal] recall error:', err);
    return '';
  }
}

/**
 * Save a new memory for a user namespace (fire-and-forget safe).
 * namespace = Sui wallet address.
 */
export async function memwalRemember(userId: string, text: string): Promise<void> {
  try {
    const memwal = getClient();
    // Correct: remember(text, namespace) — namespace is positional string
    const job = await memwal.remember(text, userId);
    if (job?.job_id) {
      // Wait in background — don't block the response to user
      memwal.waitForRememberJob(job.job_id).catch((e) =>
        console.error('[MemWal] waitForRememberJob error:', e),
      );
    }
  } catch (err) {
    console.error('[MemWal] remember error:', err);
  }
}
