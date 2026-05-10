import type { WalrusUploadResponse } from '@/types/walform';
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
    suiClient = new SuiJsonRpcClient({ 
      url: getJsonRpcFullnodeUrl(NETWORK as any),
      network: NETWORK as any
    });
  }
  if (!walrusClient) {
    const config: any = { 
      network: NETWORK as any,
      suiClient: suiClient as any 
    };
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

/**
 * Uploads data to Walrus using the provided wallet signer.
 */
export async function uploadJsonOnChain<T>(
  data: T, 
  ownerAddress: string, 
  signAndExecute: (args: any) => Promise<any>, // Passed from dAppKit hook
  epochs = 1, 
  onProgress?: (progress: any) => void
): Promise<WalrusUploadResponse> {
  if (!ownerAddress) throw new Error("Wallet not connected");

  onProgress?.({ message: 'Preparing blob data...' });
  const submission = { ...data, wallet: ownerAddress, timestamp: Date.now() };
  const bytes = new Uint8Array(new TextEncoder().encode(JSON.stringify(submission)));
  
  const client = getWalrusClient();

  try {
    onProgress?.({ message: 'Encoding blob...' });
    const { blobId, rootHash, sliversByNode } = await client.encodeBlob(bytes);
    
    onProgress?.({ message: 'Creating registration transaction...' });
    const txb = client.registerBlobTransaction({
      blobId,
      rootHash,
      size: bytes.length,
      epochs,
      deletable: true,
      owner: ownerAddress
    });

    onProgress?.({ message: 'Please approve the transaction in your wallet...' });
    
    // Execute via the passed signer (dAppKit hook)
    const result = await signAndExecute({
      transaction: txb,
      options: { showObjectChanges: true }
    });

    const blobObject = result.objectChanges?.find(
      (c: any) => c.type === 'created' && c.objectType.includes('::blob::Blob')
    );
    const objectId = blobObject?.objectId || result.digest;

    onProgress?.({ message: 'Uploading to nodes...' });
    
    await client.writeEncodedBlobToNodes({
      blobId,
      objectId,
      deletable: true,
      metadata: { 
        V1: { 
          encoding_type: 'RedStuff', 
          unencoded_length: bytes.length,
          hashes: [{ primary_hash: { Digest: rootHash }, secondary_hash: { Empty: true } }]
        } 
      },
      sliversByNode
    });

    onProgress?.({ message: 'Successfully published!' });

    return {
      blobId,
      objectId,
      endEpoch: epochs,
    };
  } catch (err: any) {
    console.error("SDK UPLOAD ERROR:", err);
    throw new Error(err.message || "Walrus SDK Upload failed.");
  }
}

export const uploadOnChain = uploadJsonOnChain;

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
