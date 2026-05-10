/**
 * Walrus On-Chain Integration
 *
 * Bridges the official Walrus SDK upload (wallet-signed) with
 * the Sui Move smart contracts for form/submission indexing.
 */

import type { WalrusUploadResponse } from '@/types/walform';
import type { WalrusSigner } from '@/lib/walrus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WALFORM_PACKAGE_ID: string =
  '0x56d0c64c632b581c6efc3fa7b6f058f3d1cdbd1d83fb7399a9da2cac48267e3f';

// ---------------------------------------------------------------------------
// Upload entry point
// ---------------------------------------------------------------------------

/**
 * Upload arbitrary data to Walrus Mainnet using the official SDK.
 *
 * The wallet (via `signer`) pays for storage in WAL/SUI tokens.
 * Two wallet signature popups will appear:
 *   1. Register blob on-chain
 *   2. Certify blob availability
 *
 * @param data          JSON-serializable value, Uint8Array, Blob, or File
 * @param signer        Wallet signer (address + signAndExecute callback)
 * @param epochs        Storage duration (default 3 ≈ ~3-4 months)
 * @param onProgress    Optional UI progress callback
 */
export async function uploadOnChain(
  data: unknown,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (progress: { message: string }) => void,
): Promise<WalrusUploadResponse> {
  if (!signer?.address) {
    throw new Error('Sui Wallet not connected. Please connect your wallet first.');
  }

  const { uploadBytesToWalrus } = await import('@/lib/walrus');

  // Serialise to bytes
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof Blob || data instanceof File) {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(data));
  }

  return uploadBytesToWalrus(bytes, signer, epochs, (p) =>
    onProgress?.({ message: p.message ?? `Status: ${p.status}` }),
  );
}

/**
 * Convenience wrapper for JSON uploads.
 */
export async function uploadJsonOnChain<T>(
  data: T,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (progress: { message: string }) => void,
): Promise<WalrusUploadResponse> {
  return uploadOnChain(data, signer, epochs, onProgress);
}

// ---------------------------------------------------------------------------
// Sui Move contract interactions
// ---------------------------------------------------------------------------

/** Creates a Form indexing object on Sui chain. */
export async function createFormObject(
  formId: string,
  blobId: string,
  _ownerAddress: string,
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

/** Creates a Submission indexing object on Sui chain. */
export async function createSubmissionObject(
  formId: string,
  blobId: string,
  status: string,
  owner: string,
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
