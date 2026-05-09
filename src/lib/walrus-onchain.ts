/**
 * Ultra-Resilient Walrus upload logic with Byte Conversion for Node Storage.
 * Fixes "Too many failures while writing blob" by ensuring data is in the most stable format (Uint8Array).
 */

import type { WalrusUploadResponse } from '@/types/walform';
import { dAppKit } from '@/app/dapp-kit';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { WalrusClient } from '@mysten/walrus';
import { NETWORK } from '@/lib/walrus';

let suiClient: SuiJsonRpcClient | null = null;
let walrusClient: WalrusClient | null = null;

const WALRUS_MAINNET_SYSTEM_ID = '0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2';
const WALRUS_MAINNET_PACKAGE_ID = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77';

// UPDATE THIS after deploying the move package
export const WALFORM_PACKAGE_ID: string = '0x56d0c64c632b581c6efc3fa7b6f058f3d1cdbd1d83fb7399a9da2cac48267e3f'; 

function initClients() {
  if (!suiClient) {
    console.log("ON-CHAIN SYNC: Initializing with", NETWORK);
    suiClient = new SuiJsonRpcClient({ 
      url: getJsonRpcFullnodeUrl(NETWORK as any),
      network: NETWORK as any
    });
  }
  if (!walrusClient) {
    const config: any = { network: NETWORK as any, suiClient: suiClient as any };
    if (NETWORK === 'mainnet') {
      config.packageId = WALRUS_MAINNET_PACKAGE_ID;
      config.systemObjectId = WALRUS_MAINNET_SYSTEM_ID;
    }
    walrusClient = new WalrusClient(config);
  }
}

export function getWalrusClient() {
  initClients();
  return walrusClient!;
}

export function getSuiClient() {
  initClients();
  return suiClient!;
}

export async function uploadOnChain(
  data: any,
  ownerAddress: string,
  epochs = 1,
  targetOwner?: string
): Promise<WalrusUploadResponse> {
  
  if (!ownerAddress) throw new Error("Wallet not connected");

  // 1. Prepare Data as Uint8Array (most stable for nodes)
  let blob: Blob;
  if (data instanceof Blob || data instanceof File) {
    blob = data;
  } else {
    const submission = { ...data, wallet: ownerAddress, timestamp: Date.now() };
    blob = new Blob([JSON.stringify(submission)], { type: "application/json" });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const client = getWalrusClient();

  try {
    console.log('[Walrus] Uploading via HTTP Publisher API to avoid CORS and Node failures...');
    // The publisher handles registration, storage, certification, and transfers the Blob to finalOwner
    const { uploadBytesToWalrus } = await import('@/lib/walrus');
    const response = await uploadBytesToWalrus(bytes, epochs, targetOwner || ownerAddress);
    console.log('[Walrus] Upload Success:', response.blobId);
    return response;
  } catch (err: any) {
    console.error("UPLOAD ERROR DETAILS:", err);
    throw new Error(`Walrus HTTP Publisher failed: ${err.message}`);
  }
}

export async function uploadJsonOnChain<T>(data: T, ownerAddress: string, epochs = 1, targetOwner?: string) {
  return uploadOnChain(data, ownerAddress, epochs, targetOwner);
}

/**
 * Creates a Form object on Sui to index the Walrus blob.
 */
export async function createFormObject(formId: string, blobId: string, ownerAddress: string) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::create_form`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(blobId),
      txb.pure.u64(Date.now()),
    ],
  });
  return txb;
}

/**
 * Creates a Submission object on Sui and transfers it to the form owner.
 */
export async function createSubmissionObject(formId: string, blobId: string, status: string, owner: string) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::register_submission`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(blobId),
      txb.pure.u64(Date.now()),
      txb.pure.string(status),
      txb.pure.address(owner),
    ],
  });
  return txb;
}
