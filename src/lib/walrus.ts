/**
 * Walrus HTTP API - Direct Browser Uploads
 * Mainnet: publisher.walrus.space + aggregator.walrus.space
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet'; 
export const WALRUS_AGGREGATOR = 'https://wal-aggregator-mainnet.staketab.org';

// Walrus Mainnet Publisher Pool
export const PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.mystenlabs.com',
  'https://publisher.walrus.space',
  'https://walrus-mainnet-publisher.staketab.org',
  'https://walrus-mainnet-publisher-1.staketab.org',
  'https://walrus-mainnet-publisher.chainode.tech',
  'https://publisher.walrus-mainnet.nodeinfra.com',
  'https://publisher.walrus-mainnet.decentnode.com',
  'https://publisher.walrus-mainnet.blockscope.net'
];

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
  // Wrap data in a Blob to ensure the browser calculates Content-Length properly
  // Passing Uint8Array directly can cause chunked encoding or missing headers,
  // which causes strict nodes and Vercel to immediately close the connection (Failed to fetch).
  const blobBody = data instanceof Blob ? data : new Blob([data as any], { type: 'application/octet-stream' });
  const startTime = Date.now();
  let lastError: string = '';

  for (const provider of PUBLISHER_POOL) {
    const providerName = new URL(provider).hostname;
    
    // Try Proxy then Direct for each provider
    for (const mode of ['proxy', 'direct']) {
      try {
        const isDirect = mode === 'direct';
        const statusMsg = isDirect 
          ? `Direct upload to ${providerName}...` 
          : `Uploading to ${providerName}...`;
        
        onProgress?.({ status: 'uploading', provider: providerName, message: statusMsg });

        let url = '';
        let method = 'POST';
        const headers: Record<string, string> = {};
        
        if (isDirect) {
          // Direct PUT to publisher
          url = `${provider}/v1/blobs?epochs=${epochs}`;
          if (sendObjectTo) url += `&send_object_to=${sendObjectTo}`;
          method = 'PUT';
          // Explicitly set content-type for direct uploads
          headers['Content-Type'] = 'application/octet-stream';
        } else {
          // Proxy via Vercel
          url = `/api/walrus/upload?epochs=${epochs}&publisher=${encodeURIComponent(provider)}`;
          if (sendObjectTo) url += `&send_object_to=${sendObjectTo}`;
          method = 'POST';
        }

        // Robust timeout implementation
        const timeoutMs = isDirect ? 120000 : 45000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let res: Response;
        try {
          res = await fetch(url, { 
            method, 
            headers,
            body: blobBody,
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          let errorInfo = '';
          try {
            const json = await res.json();
            errorInfo = json.error || JSON.stringify(json);
          } catch {
            errorInfo = await res.text();
          }
          throw new Error(errorInfo || `HTTP ${res.status}`);
        }

        const result = await res.json();
        const duration = Date.now() - startTime;
        console.log(`[Walrus] SUCCESS! Provider: ${providerName}, Duration: ${duration}ms, Mode: ${mode}`);
        onProgress?.({ status: 'success', provider: providerName, message: 'Upload successful!' });
        return parseWalrusResponse(result);

      } catch (err: any) {
        // If it's an AbortError, it was our timeout
        if (err.name === 'AbortError') {
          lastError = 'Connection timed out';
        } else {
          lastError = err.message || 'Connection failed (CORS or Network Error)';
        }
        
        console.warn(`[Walrus] [${providerName}] ${mode} attempt failed: ${lastError}`);
        
        // Brief pause if proxy failed before trying direct
        if (mode === 'proxy') {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  }

  // If we reach here, all providers failed.
  console.error('[Walrus] All providers failed. Throwing error for sync engine retry...');

  onProgress?.({ status: 'failed', message: 'Offline or all nodes busy.' });
  throw new Error(`All providers failed. Last error: ${lastError}`);
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
 * Background Queue Processor
 */
export async function processUploadQueue() {
  const queue = JSON.parse(localStorage.getItem('walform_upload_queue') || '[]');
  if (queue.length === 0) return;

  console.log(`[Walrus] Processing ${queue.length} items from local queue...`);
  const newQueue = [];

  for (const item of queue) {
    try {
      const data = new Uint8Array(item.data);
      await uploadBytesToWalrus(data, item.epochs, item.sendObjectTo);
      console.log('[Walrus] Successfully flushed queued item.');
    } catch {
      newQueue.push(item); // Keep in queue
    }
  }

  localStorage.setItem('walform_upload_queue', JSON.stringify(newQueue));
}

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
