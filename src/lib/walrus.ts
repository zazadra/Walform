/**
 * Walrus HTTP API
 *
 * Upload Strategy (3-tier):
 *   1. Direct browser upload → fastest, uses user's IP (no server-side rate limits)
 *   2. Backend relay → fallback if CORS blocks direct
 *   3. Error with clear message
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet';

// Aggregators for reads (multiple for redundancy)
const AGGREGATOR_POOL = [
  'https://aggregator.walrus-mainnet.mystenlabs.com',
  'https://aggregator.walrus.space',
  'https://wal-aggregator-mainnet.staketab.org',
];
export const WALRUS_AGGREGATOR = AGGREGATOR_POOL[0];

// Publishers that are known to support CORS and are reliably online on mainnet
const DIRECT_PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.mystenlabs.com', // Official — most reliable
  'https://publisher.walrus.space',                  // Community — good uptime
  'https://walrus-mainnet-publisher.staketab.org',   // Community
];

export type UploadStatus = 'pending' | 'uploading' | 'retrying' | 'queued' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  attempt?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  if (result.newlyCreated) {
    const blob = (result.newlyCreated as Record<string, unknown>).blobObject as Record<string, unknown>;
    return {
      blobId:   blob.blobId as string,
      objectId: blob.id as string,
      endEpoch: (blob.storage as Record<string, unknown>)?.endEpoch as number,
    };
  }
  if (result.alreadyCertified) {
    const ac = result.alreadyCertified as Record<string, unknown>;
    return {
      blobId:   ac.blobId as string,
      objectId: ((ac.event as Record<string, unknown>)?.txDigest as string) ?? '',
      endEpoch: ac.endEpoch as number,
    };
  }
  throw new Error('Unexpected Walrus response: ' + JSON.stringify(result));
}

// ---------------------------------------------------------------------------
// Tier 1: Direct browser upload (no server round-trip, no IP rate limits)
// ---------------------------------------------------------------------------

async function tryDirectUpload(
  bytes: Uint8Array,
  epochs: number,
  sendObjectTo?: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse | null> {
  for (const publisherUrl of DIRECT_PUBLISHER_POOL) {
    let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
    if (sendObjectTo) url += `&send_object_to=${encodeURIComponent(sendObjectTo)}`;

    onProgress?.({ status: 'uploading', provider: publisherUrl.replace('https://', ''), message: `Trying ${publisherUrl.replace('https://', '')}...` });

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes as any,
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        console.warn(`[Walrus Direct] ${publisherUrl} → ${res.status}`);
        continue;
      }

      const data = await res.json();
      console.log(`[Walrus Direct] SUCCESS via ${publisherUrl}`);
      return parseWalrusResponse(data);

    } catch (err: any) {
      // CORS or network failure → try next
      console.warn(`[Walrus Direct] ${publisherUrl} → ${err.message}`);
      continue;
    }
  }

  return null; // All direct attempts failed
}

// ---------------------------------------------------------------------------
// Tier 2: Backend relay (server-side, bypasses CORS)
// ---------------------------------------------------------------------------

async function tryRelayUpload(
  data: string | Uint8Array | File | Blob,
  epochs: number,
  sendObjectTo?: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  onProgress?.({ status: 'retrying', provider: 'Backend Relay', message: 'Trying server relay...' });

  let url = `/api/walrus/upload?epochs=${epochs}`;
  if (sendObjectTo) url += `&send_object_to=${encodeURIComponent(sendObjectTo)}`;

  const res = await fetch(url, {
    method: 'POST',
    body: data as any,
  });

  let result: any;
  try {
    result = await res.json();
  } catch {
    throw new Error(`Relay HTTP ${res.status}: ${res.statusText}`);
  }

  if (!res.ok) {
    throw new Error(result?.error || `Relay failed (HTTP ${res.status})`);
  }

  return parseWalrusResponse(result);
}

// ---------------------------------------------------------------------------
// Main export: 3-tier upload with automatic fallback
// ---------------------------------------------------------------------------

export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const startTime = Date.now();

  // Convert to Uint8Array for direct upload
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof Blob || data instanceof File) {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data as Uint8Array;
  }

  // --- Tier 1: Direct browser upload ---
  try {
    onProgress?.({ status: 'uploading', message: 'Connecting to Walrus network...' });
    const directResult = await tryDirectUpload(bytes, epochs, sendObjectTo, onProgress);
    if (directResult) {
      const duration = Date.now() - startTime;
      console.log(`[Walrus] Direct upload SUCCESS in ${duration}ms`);
      onProgress?.({ status: 'success', message: `Published in ${(duration / 1000).toFixed(1)}s` });
      return directResult;
    }
  } catch (err: any) {
    console.warn('[Walrus] Direct upload failed:', err.message);
  }

  // --- Tier 2: Backend relay ---
  try {
    onProgress?.({ status: 'retrying', message: 'Trying backup relay...' });
    const relayResult = await tryRelayUpload(data, epochs, sendObjectTo, onProgress);
    const duration = Date.now() - startTime;
    console.log(`[Walrus] Relay upload SUCCESS in ${duration}ms`);
    onProgress?.({ status: 'success', message: `Published via relay in ${(duration / 1000).toFixed(1)}s` });
    return relayResult;
  } catch (err: any) {
    console.error('[Walrus] Relay upload failed:', err.message);
    onProgress?.({ status: 'failed', message: 'Upload failed. Check your connection.' });
    throw new Error(`Walrus upload failed: ${err.message}`);
  }
}

export async function uploadJsonToWalrus<T>(
  data: T,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), epochs, sendObjectTo, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, epochs, sendObjectTo, onProgress);
}

// ---------------------------------------------------------------------------
// Read Operations (multi-aggregator with retry)
// ---------------------------------------------------------------------------

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  for (const agg of AGGREGATOR_POOL) {
    try {
      const res = await fetch(`${agg}/v1/blobs/${blobId}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  throw new Error(`Failed to read blob ${blobId} from all aggregators`);
}

export async function readJsonFromWalrus<T>(blobId: string, retries = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      const bytes = await readBlobFromWalrus(blobId);
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

export function getWalrusBlobUrl(blobId: string) {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}

export function getWalrusScanUrl(blobId: string) {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
