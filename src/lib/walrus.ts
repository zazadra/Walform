/**
 * Walrus Upload – Official SDK (writeBlobFlow + Upload Relay)
 *
 * Key fixes vs previous version:
 *  - Added uploadRelay config → routes through relay instead of 2200+ direct storage node requests
 *  - Switched writeFilesFlow → writeBlobFlow (simpler, same result for raw bytes)
 *  - Removed incorrect `digest: blobId` arg from flow.upload() — digest is for resume only
 */

import type { WalrusUploadResponse } from '@/types/walform';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { WalrusClient } from '@mysten/walrus';

export const NETWORK = 'mainnet' as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import { WALRUS_AGGREGATORS, PRIMARY_AGGREGATOR } from './walrus-providers';

const UPLOAD_RELAY_HOST = 'https://upload-relay.mainnet.walrus.space';
const AGGREGATOR = PRIMARY_AGGREGATOR;
const AGGREGATORS = WALRUS_AGGREGATORS;

export const WALRUS_AGGREGATOR = AGGREGATOR;




// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus = 'pending' | 'encoding' | 'registering' | 'uploading' | 'certifying' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  attempt?: number;
  message?: string;
}

export interface WalrusSigner {
  signAndExecute(transaction: unknown): Promise<{ digest: string }>;
  address: string;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

export function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  if (typeof result.blobId === 'string') {
    return {
      blobId: result.blobId,
      objectId: (result.id as string | undefined) ?? '',
      endEpoch: result.endEpoch as number | undefined,
    };
  }
  if (result.newlyCreated) {
    const blob = (result.newlyCreated as Record<string, unknown>).blobObject as Record<string, unknown>;
    return {
      blobId: blob.blobId as string,
      objectId: blob.id as string,
      endEpoch: (blob.storage as Record<string, unknown>)?.endEpoch as number,
    };
  }
  if (result.alreadyCertified) {
    const ac = result.alreadyCertified as Record<string, unknown>;
    return {
      blobId: ac.blobId as string,
      objectId: ((ac.event as Record<string, unknown>)?.txDigest as string) ?? '',
      endEpoch: ac.endEpoch as number,
    };
  }
  throw new Error('Unrecognised Walrus response: ' + JSON.stringify(result).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Singleton WalrusClient (avoids re-loading WASM on every call)
// ---------------------------------------------------------------------------

let _walrusClient: WalrusClient | null = null;

function getWalrusClient(): WalrusClient {
  if (!_walrusClient) {
    const suiClient = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io', network: NETWORK });
    _walrusClient = new WalrusClient({
      network: NETWORK,
      suiClient: suiClient as any,
      // FIX: Upload relay routes through relay server instead of hitting 2200+ storage nodes
      uploadRelay: {
        host: UPLOAD_RELAY_HOST,
      },
    });
  }
  return _walrusClient;
}

// ---------------------------------------------------------------------------
// Main upload – writeBlobFlow (simpler + faster than writeFilesFlow)
// ---------------------------------------------------------------------------

export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  signer: WalrusSigner,
  epochs = 3,
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

  onProgress?.({ status: 'encoding', message: 'Encoding data...' });

  try {
    const walrusClient = getWalrusClient();
    const flow = walrusClient.writeBlobFlow({ blob: bytes });

    const encoded = await flow.encode();
    const blobId = encoded.blobId;

    // Pre-check: if already on Walrus, skip wallet popups
  try {
    const existing = await readBlobFromWalrus(blobId);
    if (existing) {
      onProgress?.({ status: 'success', message: 'Already on Walrus ✓' });
      return { blobId, objectId: '', endEpoch: 0 };
    }
  } catch { /* not found, continue with upload */ }

  // 1. Register (wallet popup #1)
  onProgress?.({ status: 'registering', message: 'Waiting for wallet approval (register)...' });
  const registerTx = flow.register({ owner: signer.address, deletable: false, epochs });

  if (registerTx && registerTx.getData().commands.length > 0) {
    try {
      await signer.signAndExecute(registerTx);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        onProgress?.({ status: 'failed', message: 'Upload cancelled by user.' });
        throw err;
      }
      if (!msg.includes('no balance changes')) {
        console.warn('Register tx warning (may be pre-registered):', msg);
      }
    }
  }

  // 2. Upload via relay (no wallet popup — relay handles storage node distribution)
  onProgress?.({ status: 'uploading', message: 'Uploading to Walrus network...' });
  // FIX: No `digest` argument — that is only for resume from a previous encode step
  const uploaded = await flow.upload();

  // 3. Certify (wallet popup #2)
  onProgress?.({ status: 'certifying', message: 'Waiting for wallet approval (certify)...' });
  const certifyTx = flow.certify();
  if (certifyTx && certifyTx.getData().commands.length > 0) {
    try {
      await signer.signAndExecute(certifyTx);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        onProgress?.({ status: 'failed', message: 'Upload cancelled by user.' });
        throw err;
      }
      if (!msg.includes('no balance changes')) {
        console.warn('Certify tx warning (may be pre-certified):', msg);
      }
    }
  }

  // Extract clean 43-char blobId
  const rawBlobId = uploaded.blobId ?? blobId;
  const cleanBlobId = rawBlobId.slice(0, 43);

  onProgress?.({ status: 'success', message: `Stored on Walrus ✓ (${cleanBlobId.slice(0, 12)}…)` });

    return {
      blobId: cleanBlobId,
      objectId: uploaded.blobObjectId ?? '',
      endEpoch: 0,
    };
  } catch (err: any) {
    const msg = err.message || String(err);
    const isUserRejection = /user rejected|cancelled|rejected/i.test(msg);

    // If user rejected, don't fallback to server (server can't bypass wallet)
    if (isUserRejection) {
      onProgress?.({ status: 'failed', message: 'Upload cancelled by user.' });
      throw err;
    }

    console.warn('[Walrus] Native SDK failed, falling back to API relay...', err);
    onProgress?.({ status: 'uploading', message: 'Native upload failed, trying server relay...' });
    
    // Fallback to our robust server-side /api/walrus/upload
    const res = await fetch('/api/walrus/upload?epochs=' + epochs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes as any,
    });
    
    if (!res.ok) {
      const txt = await res.text();
      // If server relay also fails, provide a specific error message
      if (res.status === 502 || res.status === 504) {
        throw new Error(`Walrus Mainnet Infrastructure is currently unstable (502/504). Please try again later or check https://status.wal.app`);
      }
      throw new Error(`API Relay failed: ${res.status} ${txt}`);
    }
    
    const data = await res.json();
    if (!data.blobId) throw new Error('API Relay failed to return blobId');
    
    onProgress?.({ status: 'success', message: `Stored via Relay ✓ (${data.blobId.slice(0, 12)}…)` });
    return {
      blobId: data.blobId,
      objectId: data.objectId || '',
      endEpoch: data.endEpoch || epochs,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export async function uploadJsonToWalrus<T>(
  data: T,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), signer, epochs, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, signer, epochs, onProgress);
}

// ---------------------------------------------------------------------------
// Read operations (no wallet needed)
// ---------------------------------------------------------------------------

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  const cleanBlobId = blobId.slice(0, 43);
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
  return `${AGGREGATOR}/v1/blobs/${blobId.slice(0, 43)}`;
}

export function getWalrusScanUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
