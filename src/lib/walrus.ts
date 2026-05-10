/**
 * Walrus Upload – Official SDK approach
 *
 * Uses @mysten/walrus `writeFilesFlow` with the official Mysten Upload Relay.
 *
 * Flow (browser, wallet-signed):
 *   1. encode()        – WASM encodes the blob locally, produces blobId
 *   2. register tx     – wallet signs a Sui tx to register blob on-chain (costs WAL/SUI)
 *   3. upload()        – relay receives encoded slivers (no extra wallet popup)
 *   4. certify tx      – wallet signs a Sui tx to certify availability
 *
 * The Upload Relay offloads writing ~2200 shard requests to the relay server,
 * so the browser only needs 4 round-trips (2 wallet signatures).
 *
 * Reads use the public aggregator — no wallet needed.
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet' as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Official Mysten Labs Upload Relay – DNS verified: 34.120.182.114 */
const UPLOAD_RELAY_HOST = 'https://upload-relay.mainnet.walrus.space';

/** Official Mysten Labs Aggregator for reads */
const AGGREGATOR = 'https://aggregator.walrus-mainnet.walrus.space';

/** Public fallback aggregator */
const AGGREGATORS = [
  AGGREGATOR,
  'https://wal-aggregator-mainnet.staketab.org',
];

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
  /**
   * Sign and execute a Sui transaction.
   * Returns the transaction digest on success, throws on failure.
   */
  signAndExecute(transaction: unknown): Promise<{ digest: string }>;
  /** The Sui wallet address this signer represents */
  address: string;
}

// ---------------------------------------------------------------------------
// Response parser (handles both SDK and raw HTTP shapes)
// ---------------------------------------------------------------------------

export function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  // Shape from @mysten/walrus SDK writeBlob / writeFiles
  if (typeof result.blobId === 'string') {
    return {
      blobId: result.blobId,
      objectId: (result.id as string | undefined) ?? '',
      endEpoch: result.endEpoch as number | undefined,
    };
  }
  // Shape from raw HTTP publisher (legacy fallback)
  if (result.newlyCreated) {
    const blob = (result.newlyCreated as Record<string, unknown>)
      .blobObject as Record<string, unknown>;
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
// Main upload – uses official SDK + Upload Relay + wallet signer
// ---------------------------------------------------------------------------

/**
 * Upload bytes to Walrus Mainnet using the official TypeScript SDK.
 *
 * Requires a connected Sui wallet (via WalrusSigner) to pay for storage.
 * The Upload Relay handles distributing shard data to storage nodes,
 * so the browser only needs 2 wallet signature popups.
 *
 * @param data        Raw bytes, string, File, or Blob to store
 * @param signer      Wallet signer (address + signAndExecute)
 * @param epochs      Storage duration in epochs (default: 3 ≈ ~3-4 months)
 * @param onProgress  Optional progress callback
 */
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

  onProgress?.({ status: 'encoding', message: 'Encoding data for Walrus…' });

  // Lazy-import SDK (avoids WASM loading at module init time)
  const { SuiGrpcClient } = await import('@mysten/sui/grpc');
  const { walrus, WalrusFile } = await import('@mysten/walrus');

  const suiClient = new SuiGrpcClient({
    network: NETWORK,
    baseUrl: `https://fullnode.${NETWORK}.sui.io:443`,
  });

  const client = suiClient.$extend(
    walrus({
      uploadRelay: {
        host: UPLOAD_RELAY_HOST,
        // SDK auto-discovers the tip config from /v1/tip-config
        sendTip: { max: 100_000 }, // max 0.0001 SUI tip to relay
      },
      storageNodeClientOptions: {
        timeout: 60_000,
        onError: (err: unknown) =>
          console.warn('[Walrus SDK node error]', err),
      },
    }),
  );

  // Create a flow – this lets us interleave wallet signatures with uploads
  const file = WalrusFile.from({ contents: bytes, identifier: 'upload.bin' });
  const flow = client.walrus.writeFilesFlow({ files: [file] });

  // Step 1: Encode (local WASM – no network)
  await flow.encode();

  // Step 2: Register on Sui chain (first wallet popup)
  onProgress?.({ status: 'registering', message: 'Waiting for wallet approval (register)…' });
  const registerTx = flow.register({
    epochs,
    owner: signer.address,
    deletable: false,
  });

  const registerResult = await signer.signAndExecute(registerTx);

  // Step 3: Upload encoded slivers to storage nodes via relay (no wallet needed)
  onProgress?.({ status: 'uploading', message: 'Uploading to Walrus storage nodes…' });
  await flow.upload({ digest: registerResult.digest });

  // Step 4: Certify on Sui chain (second wallet popup)
  onProgress?.({ status: 'certifying', message: 'Waiting for wallet approval (certify)…' });
  const certifyTx = flow.certify();
  await signer.signAndExecute(certifyTx);

  // Step 5: Retrieve the final file list with blobId
  const files = await flow.listFiles();
  if (!files || files.length === 0) {
    throw new Error('Upload succeeded but no blob metadata returned');
  }

  const uploaded = files[0];
  const blobId = uploaded.id ?? '';

  onProgress?.({ status: 'success', message: `Stored on Walrus ✓ (blobId: ${blobId.slice(0, 12)}…)` });

  return { blobId, objectId: '', endEpoch: undefined };
}

// ---------------------------------------------------------------------------
// Convenience wrappers (backward-compatible API surface)
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
// Read operations (public aggregator – no wallet needed)
// ---------------------------------------------------------------------------

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  for (const agg of AGGREGATORS) {
    try {
      const res = await fetch(`${agg}/v1/blobs/${blobId}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  throw new Error(`Failed to read blob "${blobId}" from all aggregators`);
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
  return `${AGGREGATOR}/v1/blobs/${blobId}`;
}

export function getWalrusScanUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
