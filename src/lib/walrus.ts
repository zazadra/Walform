/**
 * Walrus Upload — Official SDK (writeBlobFlow + Upload Relay)
 *
 * Architecture:
 *  - ALL uploads are wallet-signed by the user in the browser.
 *  - The upload relay (upload-relay.mainnet.walrus.space) distributes blob
 *    shards to storage nodes — this is correct and stays.
 *  - There is NO server-side fallback. The server cannot sign Sui transactions.
 *  - On failure, structured errors guide the user to the right recovery action.
 */

import type { WalrusUploadResponse } from '@/types/walform';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { WalrusClient } from '@mysten/walrus';
import { WALRUS_AGGREGATORS, PRIMARY_AGGREGATOR } from './walrus-providers';

export const NETWORK = 'mainnet' as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPLOAD_RELAY_HOST = 'https://upload-relay.mainnet.walrus.space';
const AGGREGATOR = PRIMARY_AGGREGATOR;
const AGGREGATORS = WALRUS_AGGREGATORS;

export const WALRUS_AGGREGATOR = AGGREGATOR;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Granular upload step for UI progress display */
export type UploadStatus =
  | 'pending'
  | 'encoding'
  | 'checking'
  | 'registering'
  | 'uploading'
  | 'certifying'
  | 'success'
  | 'failed';

export interface UploadProgress {
  status: UploadStatus;
  /** Human-readable label shown to the user */
  message: string;
  provider?: string;
}

export interface WalrusSigner {
  signAndExecute(transaction: unknown): Promise<{ digest: string }>;
  address: string;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type WalrusErrorKind =
  | 'user_rejected'       // User cancelled wallet popup
  | 'insufficient_funds'  // Not enough SUI/WAL
  | 'network_timeout'     // Request timed out
  | 'publisher_error'     // 502/503 from storage nodes
  | 'already_certified'   // Blob already on-chain (treat as success)
  | 'unknown';

export interface WalrusError {
  kind: WalrusErrorKind;
  /** Short user-friendly message */
  userMessage: string;
  /** Full technical detail for console */
  detail: string;
}

export function classifyWalrusError(err: unknown): WalrusError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (/user rejected|user denied|cancelled|rejected the request/i.test(msg)) {
    return {
      kind: 'user_rejected',
      userMessage: 'Upload cancelled.',
      detail: msg,
    };
  }

  if (/insufficient|not enough|balance|budget|gas|wal.*fund|fund.*wal/i.test(lower)) {
    return {
      kind: 'insufficient_funds',
      userMessage: 'Insufficient SUI or WAL balance. Top up your wallet and try again. (The register transaction includes a WAL relay tip.)',
      detail: msg,
    };
  }

  if (/timeout|timed out|etimedout|econnreset|econnaborted/i.test(lower)) {
    return {
      kind: 'network_timeout',
      userMessage: 'Upload timed out. Please check your connection and try again.',
      detail: msg,
    };
  }

  if (/502|503|504|bad gateway|service unavailable|publisher/i.test(lower)) {
    return {
      kind: 'publisher_error',
      userMessage: 'Walrus network is temporarily unavailable. Please try again in a moment.',
      detail: msg,
    };
  }

  if (/already certified|already stored|alreadycertified/i.test(lower)) {
    return {
      kind: 'already_certified',
      userMessage: 'File is already stored on Walrus.',
      detail: msg,
    };
  }

  return {
    kind: 'unknown',
    userMessage: msg.length > 120 ? msg.slice(0, 120) + '…' : msg,
    detail: msg,
  };
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
      uploadRelay: {
        host: UPLOAD_RELAY_HOST,
        // The Mainnet relay requires a WAL tip payment.
        // { max } → SDK auto-fetches the relay's /v1/tip-config and embeds the
        // tip payment in the register tx. max caps the amount in MIST (0.1 WAL).
        sendTip: { max: 100_000_000 },
      },
    });
  }
  return _walrusClient;
}

// ---------------------------------------------------------------------------
// Main upload — wallet-signed, browser-only
//
// Flow:
//   1. encode  (WASM, no wallet)
//   2. pre-check if already certified (skip wallet popups if so)
//   3. register tx → wallet popup #1
//   4. upload via relay (no wallet — relay handles shard distribution)
//   5. certify tx → wallet popup #2
// ---------------------------------------------------------------------------

export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  signer: WalrusSigner,
  epochs = 1,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  if (!signer?.address) {
    throw new Error('Wallet not connected. Please connect your Sui wallet to upload files.');
  }

  // Normalise to Uint8Array
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  }

  onProgress?.({ status: 'encoding', message: 'Preparing file…' });

  const walrusClient = getWalrusClient();
  const flow = walrusClient.writeBlobFlow({ blob: bytes });

  // Step 1: Encode (browser WASM — no network, no wallet)
  const encoded = await flow.encode();
  const blobId = encoded.blobId;

  // Step 2: Quick pre-check (3s timeout, primary aggregator only)
  // If the blob is already certified we can skip both wallet popups.
  try {
    const check = await fetch(`${AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3_000),
    });
    if (check.ok) {
      onProgress?.({ status: 'success', message: 'Already stored on Walrus ✓' });
      return { blobId, objectId: '', endEpoch: 0 };
    }
  } catch {
    // Not found or timed out — continue
  }

  // Step 3: Register tx (wallet popup #1)
  onProgress?.({ status: 'registering', message: 'Approve in wallet…' });
  const registerTx = flow.register({ owner: signer.address, deletable: false, epochs });

  let registerDigest: string | undefined;
  if (registerTx && registerTx.getData().commands.length > 0) {
    try {
      const result = await signer.signAndExecute(registerTx);
      // Capture the digest so the relay can locate the blob object
      registerDigest = result.digest;
    } catch (err: any) {
      const classified = classifyWalrusError(err);
      onProgress?.({ status: 'failed', message: classified.userMessage });
      console.error('[Walrus] Register tx failed:', classified.detail);
      const typedErr = new Error(classified.userMessage);
      (typedErr as any).walrusKind = classified.kind;
      throw typedErr;
    }
  }

  // Step 4: Upload blob shards via relay (no wallet needed)
  // CRITICAL: pass the register tx digest so the relay can find the blob Sui object.
  onProgress?.({ status: 'uploading', message: 'Uploading to Walrus…' });
  let uploaded: Awaited<ReturnType<typeof flow.upload>>;
  try {
    // The relay requires either blobObjectId OR the register tx digest to associate
    // the upload with the correct Sui blob object.
    uploaded = await flow.upload(registerDigest ? { digest: registerDigest } : undefined);
  } catch (err: any) {
    const classified = classifyWalrusError(err);
    onProgress?.({ status: 'failed', message: classified.userMessage });
    console.error('[Walrus] Upload to relay failed:', classified.detail);
    const typedErr = new Error(classified.userMessage);
    (typedErr as any).walrusKind = classified.kind;
    throw typedErr;
  }

  // Step 5: Certify tx (wallet popup #2)
  onProgress?.({ status: 'certifying', message: 'Approve in wallet — certifying upload…' });
  const certifyTx = flow.certify();
  if (certifyTx && certifyTx.getData().commands.length > 0) {
    try {
      await signer.signAndExecute(certifyTx);
    } catch (err: any) {
      const classified = classifyWalrusError(err);
      // If already certified (e.g. parallel upload), treat as success
      if (classified.kind === 'already_certified') {
        console.info('[Walrus] Already certified — treating as success.');
      } else {
        onProgress?.({ status: 'failed', message: classified.userMessage });
        console.error('[Walrus] Certify tx failed:', classified.detail);
        const typedErr = new Error(classified.userMessage);
        (typedErr as any).walrusKind = classified.kind;
        throw typedErr;
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
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export async function uploadJsonToWalrus<T>(
  data: T,
  signer: WalrusSigner,
  epochs = 1,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), signer, epochs, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  signer: WalrusSigner,
  epochs = 1,
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

// ---------------------------------------------------------------------------
// Extend Walrus Blob Storage
// ---------------------------------------------------------------------------

/**
 * Build and sign a Walrus extendBlob transaction via the user's wallet.
 *
 * @param blobObjectId - The Sui object ID of the Walrus Blob (starts with 0x…)
 * @param epochs       - Additional epochs to extend by
 * @returns txDigest from the executed transaction
 */
export async function extendWalrusBlob(
  blobObjectId: string,
  epochs: number,
): Promise<{ txDigest: string }> {
  const { dAppKit } = await import('@/app/dapp-kit');
  const client = getWalrusClient();

  // Build the extend transaction using the SDK
  const tx = await client.extendBlobTransaction({ blobObjectId, epochs });

  // Sign and execute via dAppKit (same pattern as FormBuilderTab)
  const { getSuiClient } = await import('@/lib/walrus-onchain');
  const suiClient = getSuiClient() as any;
  const { bytes, signature } = await dAppKit.signTransaction({ transaction: tx as any } as any);
  const execResult = await suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true },
    requestType: 'WaitForLocalExecution',
  });
  return { txDigest: execResult.digest };
}

/**
 * Try to auto-discover the Walrus Blob Sui object ID from a blob hash.
 * Queries the owner's objects filtered by the Walrus Blob struct type.
 *
 * Returns null if the blob is not found in the wallet.
 */
export async function findWalrusBlobObjectId(
  blobId: string,
  ownerAddress: string,
): Promise<string | null> {
  try {
    const client = getWalrusClient();
    const blobType = await client.getBlobType();
    const { getSuiClient } = await import('@/lib/walrus-onchain');
    const suiClient = getSuiClient() as any;

    let cursor: string | null = null;
    do {
      const resp: any = await suiClient.getOwnedObjects({
        owner: ownerAddress,
        filter: { StructType: blobType },
        options: { showContent: true },
        ...(cursor ? { cursor } : {}),
        limit: 50,
      });
      for (const item of resp.data ?? []) {
        if (item.data?.content?.dataType !== 'moveObject') continue;
        const fields = (item.data.content as any).fields as Record<string, any>;
        if (fields.blob_id === blobId) return item.data.objectId;
      }
      cursor = resp.nextCursor ?? null;
    } while (cursor);
  } catch (e) {
    console.warn('[findWalrusBlobObjectId] query failed:', e);
  }
  return null;
}

