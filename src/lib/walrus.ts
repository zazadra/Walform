/**
 * Walrus Upload – Simple Direct Upload (Relay + Direct PUT)
 * 
 * Removed resumable/SDK flows as per USER_REQUEST.
 * Implementation focused on reliability and simplicity.
 */

import type { WalrusUploadResponse } from '@/types/walform';
import { WALRUS_PROVIDERS } from './walrus-providers';

export const NETWORK = 'mainnet' as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGREGATOR = 'https://aggregator.walrus-mainnet.walrus.space';
const AGGREGATORS = [
  AGGREGATOR,
  'https://walrus-mainnet-aggregator.nodes.guru',
  'https://wal-aggregator-mainnet.staketab.org',
  'https://aggregator.walrus.space',
];

export const WALRUS_AGGREGATOR = AGGREGATOR;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  message?: string;
}

export interface WalrusSigner {
  signAndExecute(transaction: unknown): Promise<{ digest: string }>;
  address: string;
}

// ---------------------------------------------------------------------------
// Response Parser
// ---------------------------------------------------------------------------

function extractBlobInfo(data: any) {
  if (!data) return null;
  
  // Case 1: Simple/Direct response
  if (data.blobId) return data;
  
  // Case 2: Standard Walrus Publisher response (newlyCreated)
  if (data.newlyCreated?.blobObject) {
    return {
      ...data.newlyCreated.blobObject,
      objectId: data.newlyCreated.blobObject.id || data.newlyCreated.blobObject.objectId
    };
  }
  
  // Case 3: Standard Walrus Publisher response (alreadyCertified)
  if (data.alreadyCertified) {
    return data.alreadyCertified;
  }
  
  return null;
}

// ---------------------------------------------------------------------------
// Main upload – Direct & Relay only
// ---------------------------------------------------------------------------

export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  _signer?: WalrusSigner, // Kept for signature compatibility if needed elsewhere
  epochs = 1, // Default to 1 if not specified, but we will omit from URL if possible
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  // Normalise to Uint8Array
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  }

  onProgress?.({ status: 'uploading', message: 'Uploading to Walrus...' });

  // 1. Try API relay first
  try {
    const res = await fetch('/api/walrus/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes as any,
    });
    
    if (res.ok) {
      const result = await res.json();
      const info = extractBlobInfo(result);
      
      if (info && info.blobId) {
        const cleanId = info.blobId.trim().slice(0, 43);
        onProgress?.({ status: 'success', message: 'Stored via Relay ✓' });
        return {
          success: true,
          blobId: cleanId,
          objectId: info.objectId || info.id || '',
          url: getWalrusBlobUrl(cleanId),
          endEpoch: info.endEpoch || info.storage?.endEpoch || epochs,
        };
      }
    }
  } catch (err) {
    console.warn('[Walrus] Relay failed:', err);
  }

  // 2. Try Direct Client-side PUT to publishers
  for (const provider of WALRUS_PROVIDERS) {
    try {
      const res = await fetch(provider.uploadUrl, {
        method: provider.method,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes as any,
      });
      
      if (res.ok) {
        const result = await res.json();
        const info = extractBlobInfo(result);
        
        if (info && info.blobId) {
          const cleanId = info.blobId.trim().slice(0, 43);
          onProgress?.({ status: 'success', message: `Stored via ${provider.name} ✓` });
          return {
            success: true,
            blobId: cleanId,
            objectId: info.objectId || info.id || '',
            url: getWalrusBlobUrl(cleanId),
            endEpoch: info.endEpoch || info.storage?.endEpoch || 0,
          };
        }
      }
    } catch (err) {
      console.warn(`[Walrus] Direct upload to ${provider.name} failed:`, err);
    }
  }

  throw new Error('Upload failed: All publishers are currently unreachable. Please try again.');
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export async function uploadJsonToWalrus<T>(
  data: T,
  signer?: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), signer, epochs, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  signer?: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, signer, epochs, onProgress);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  const cleanBlobId = blobId.trim().slice(0, 43);
  for (const agg of AGGREGATORS) {
    try {
      const res = await fetch(`${agg}/v1/blobs/${cleanBlobId}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  throw new Error(`Blob "${cleanBlobId}" not found on any aggregator`);
}

export async function readJsonFromWalrus<T>(blobId: string, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const bytes = await readBlobFromWalrus(blobId);
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw lastErr;
}

export function getWalrusBlobUrl(blobId: string): string {
  return `${AGGREGATOR}/v1/blobs/${blobId.trim().slice(0, 43)}`;
}

export function getWalrusScanUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId.trim().slice(0, 43)}`;
}
