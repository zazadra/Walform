/**
 * Walrus On-Chain Integration
 *
 * Coordinates between:
 *   1. Walrus blob storage (via SDK writeBlobFlow)
 *   2. Sui Move smart contracts (Form/Submission indexing)
 *
 * The upload path uses dAppKit.signAndExecuteTransaction directly to avoid 
 * account state sync issues.
 */

import type { WalrusUploadResponse } from '@/types/walform';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { NETWORK } from '@/lib/walrus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WALFORM_PACKAGE_ID =
  '0x56d0c64c632b581c6efc3fa7b6f058f3d1cdbd1d83fb7399a9da2cac48267e3f';

const WALRUS_BLOB_TYPE = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob';

// ---------------------------------------------------------------------------
// Sui Client singleton
// ---------------------------------------------------------------------------

let _suiClient: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!_suiClient) {
    _suiClient = new SuiClient({
      url: getFullnodeUrl(NETWORK as 'mainnet'),
    });
  }
  return _suiClient;
}

// ---------------------------------------------------------------------------
// Upload entry points
// ---------------------------------------------------------------------------

/**
 * Upload arbitrary data to Walrus using the user's connected dAppKit wallet.
 *
 * @param data - Any JSON-serializable value, or a raw Uint8Array/Blob/File
 * @param ownerAddress - The user's connected Sui wallet address
 * @param epochs - Storage duration (default 5 ≈ ~6 months on mainnet)
 * @param targetOwner - Address to receive the Blob NFT (defaults to ownerAddress)
 * @param onProgress - Progress message callback for UI feedback
 */
export async function uploadOnChain(
  data: unknown,
  ownerAddress: string,
  epochs = 5,
  targetOwner?: string,
  onProgress?: (progress: { message: string }) => void
): Promise<WalrusUploadResponse> {
  if (!ownerAddress) throw new Error('Sui Wallet not found. Please ensure your wallet is connected and unlocked.');

  const { getWalrusClient } = await import('@/lib/walrus');
  const client = getWalrusClient();

  // Serialize to bytes if not already raw binary
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof Blob || data instanceof File) {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(data));
  }

  onProgress?.({ message: 'Initializing Walrus upload flow...' });
  
  const uploadFlow = await client.writeBlobFlow({
    blob: bytes,
    epochs,
  });

  onProgress?.({ message: 'Requesting storage transaction signature...' });
  const tx = await uploadFlow.transaction();
  
  // Use dAppKit for signing to avoid state mismatches
  const { dAppKit } = await import('@/app/dapp-kit');
  if (!dAppKit) throw new Error('dAppKit not initialized');

  const result = await dAppKit.signAndExecuteTransaction({
    transaction: tx as any,
    options: { showObjectChanges: true, showEffects: true }
  });
  
  console.log("[Sui] Transaction Result (Initial):", result);
  
  if (result.effects?.status?.status === 'failure') {
    const error = result.effects.status.error || 'Unknown Sui error';
    console.error("[Sui] Transaction failed on-chain:", error);
    throw new Error(`Transaction failed: ${error}`);
  }

  let objectId: string | undefined;

  // Try to find the blob object ID in the response
  if (result.objectChanges) {
    const blobChange = result.objectChanges.find(
      (c: any) => c.type === 'created' && c.objectType === WALRUS_BLOB_TYPE
    );
    if (blobChange && 'objectId' in blobChange) {
      objectId = blobChange.objectId;
    }
  }

  // Fallback: wait for transaction and fetch object
  if (!objectId) {
    console.warn('[Sui] Blob ID not found in immediate response. Fetching indexed data...');
    const indexed = await getSuiClient().waitForTransaction({
      digest: result.digest,
      options: { showObjectChanges: true }
    });
    const blobChange = indexed.objectChanges?.find(
      (c: any) => c.type === 'created' && c.objectType === WALRUS_BLOB_TYPE
    );
    if (blobChange && 'objectId' in blobChange) {
      objectId = blobChange.objectId;
    }
  }

  if (!objectId) {
    console.error("[Sui] Final diagnostic check failed. Result:", result);
    throw new Error('Blob object not found in transaction. Please ensure you have enough WAL and SUI and try again.');
  }

  onProgress?.({ message: 'Writing blob to Walrus nodes...' });
  try {
    await uploadFlow.upload();
  } catch (err) {
    console.error("SDK UPLOAD ERROR:", err);
    throw err;
  }

  return {
    blobId: uploadFlow.blobId,
    blobObjectId: objectId,
    endEpoch: uploadFlow.endEpoch,
    suiTransactionDigest: result.digest
  };
}

/**
 * Convenience wrapper for JSON data uploads.
 */
export async function uploadJsonOnChain<T>(
  data: T,
  ownerAddress: string,
  epochs = 5,
  targetOwner?: string,
  onProgress?: (progress: { message: string }) => void
): Promise<WalrusUploadResponse> {
  return uploadOnChain(data, ownerAddress, epochs, targetOwner, onProgress);
}

// ---------------------------------------------------------------------------
// Sui Move contract interactions
// ---------------------------------------------------------------------------

/**
 * Creates a Form indexing object on Sui chain.
 */
export async function createFormObject(
  formId: string,
  blobId: string,
  _ownerAddress: string
) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::create_form`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(blobId),
      txb.pure.u64(BigInt(Date.now())),
    ],
  });
  return txb;
}

/**
 * Creates a Submission indexing object on Sui chain.
 */
export async function createSubmissionObject(
  formId: string,
  blobId: string,
  status: string,
  owner: string
) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::register_submission`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(blobId),
      txb.pure.u64(BigInt(Date.now())),
      txb.pure.string(status),
      txb.pure.address(owner),
    ],
  });
  return txb;
}
