/**
 * Submission Index — decentralized local index for Walform submissions.
 *
 * Strategy:
 * 1. When a user submits, we store the blobId in localStorage under 'walform:subs:ALL'.
 * 2. We also broadcast it via BroadcastChannel so any open admin tab picks it up instantly.
 * 3. On admin dashboard load, we read from localStorage AND poll the Sui blockchain
 *    for blobs owned by all known admin addresses.
 *
 * This covers the common case (same browser) with instant updates, and the
 * cross-device case via on-chain ownership (if blob transfer works) + manual refresh.
 */

const CHANNEL_NAME = 'walform:submissions';
const ALL_KEY = 'walform:subs:ALL';

/** Push a new blobId into the shared index and broadcast it to all open tabs */
export function publishSubmission(blobId: string, formBlobId: string) {
  try {
    // 1. Persist to localStorage
    const all = getIndexedBlobIds();
    if (!all.includes(blobId)) {
      localStorage.setItem(ALL_KEY, JSON.stringify([...all, blobId]));
    }

    // Also store under form-specific key
    const formKey = `walform:subs:${formBlobId}`;
    const formIds: string[] = JSON.parse(localStorage.getItem(formKey) ?? '[]');
    if (!formIds.includes(blobId)) {
      localStorage.setItem(formKey, JSON.stringify([...formIds, blobId]));
    }

    // 2. Broadcast to other tabs (e.g. admin dashboard open in same browser)
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: 'new_submission', blobId, formBlobId });
      bc.close();
    }
  } catch {
    // localStorage may be unavailable (private mode, full, etc.)
  }
}

/** Get all known submission blobIds from localStorage */
export function getIndexedBlobIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ALL_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Subscribe to new submissions broadcast from other tabs. Returns unsubscribe fn. */
export function onNewSubmission(callback: (blobId: string, formBlobId: string) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const bc = new BroadcastChannel(CHANNEL_NAME);
  bc.onmessage = (e) => {
    if (e.data?.type === 'new_submission') {
      callback(e.data.blobId, e.data.formBlobId);
    }
  };
  return () => bc.close();
}
