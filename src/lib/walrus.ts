/**
 * Walrus HTTP API - Direct Browser Uploads
 * Mainnet: publisher.walrus.space + aggregator.walrus.space
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet'; 
export const WALRUS_AGGREGATOR = 'https://wal-aggregator-mainnet.staketab.org';

export type UploadStatus = 'pending' | 'uploading' | 'retrying' | 'queued' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  attempt?: number;
  message?: string;
}

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

/**
 * Upload bytes to Walrus with failover and direct fallback
 */
export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<WalrusUploadResponse> {
  const startTime = Date.now();
  onProgress?.({ status: 'uploading', provider: 'Walrus Relay', message: 'Uploading to Walrus network...' });

  let url = `/api/walrus/upload?epochs=${epochs}`;
  if (sendObjectTo) url += `&send_object_to=${encodeURIComponent(sendObjectTo)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: data as any,
    });

    let result: any;
    try {
      result = await res.json();
    } catch {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    if (!res.ok) {
      // Extract human-readable error from relay response
      const msg = result?.error || `Upload failed (HTTP ${res.status})`;
      throw new Error(msg);
    }

    const duration = Date.now() - startTime;
    console.log(`[Walrus] SUCCESS! Duration: ${duration}ms`);
    onProgress?.({ status: 'success', provider: 'Walrus Relay', message: 'Upload successful!' });
    return parseWalrusResponse(result);

  } catch (err: any) {
    onProgress?.({ status: 'failed', message: err.message });
    throw err; // Throw the already-clean error directly
  }
}


export async function uploadJsonToWalrus<T>(
  data: T,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), epochs, sendObjectTo, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  epochs = 1,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, epochs, sendObjectTo, onProgress);
}

/**
 * Walrus Aggregator - Read Operations
 */

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Read failed (${res.status}) for ${blobId}`);
  return new Uint8Array(await res.arrayBuffer());
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
