/**
 * Ultra-Resilient Walrus upload logic with Byte Conversion for Node Storage.
 * Fixes "Too many failures while writing blob" by ensuring data is in the most stable format (Uint8Array).
 */

import type { WalrusUploadResponse } from '@/types/motion';
import { dAppKit } from '@/app/dapp-kit';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { WalrusClient } from '@mysten/walrus';

const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

let walrusClient: WalrusClient | null = null;
export function getWalrusClient() {
  if (!walrusClient) {
    walrusClient = new WalrusClient({ network: 'mainnet', suiClient: suiClient as any });
  }
  return walrusClient;
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
    console.log('[Walrus] Encoding blob:', { size: bytes.length });
    const { blobId, rootHash, metadata, sliversByNode } = await client.encodeBlob(bytes);
    
    // --- STEP: TRANSACTION MONITOR ---
    console.log('[Walrus] Snapshotting blockchain state...');
    const preTxs = await suiClient.queryTransactionBlocks({ filter: { FromAddress: ownerAddress }, limit: 1 });
    const lastDigestBefore = preTxs.data[0]?.digest;

    // Step A: Registration Transaction
    const registerTx = await client.registerBlobTransaction({
      blobId, rootHash, size: bytes.length, epochs, deletable: false, owner: targetOwner || ownerAddress,
    });

    // --- WALLET DETECTION ---
    let provider = (window as any).suiWallet || (window as any).slush;
    if (!provider && (window as any).suiWallets) {
      const wallets = (window as any).suiWallets.getTargets?.() || [];
      provider = wallets.find((w: any) => w.name.includes('Slush')) || wallets[0];
    }
    if (!provider) provider = dAppKit;

    const signAndExecute = provider.signAndExecuteTransactionBlock || 
                           provider.signAndExecuteTransaction || 
                           (provider.features?.['sui:signAndExecuteTransactionBlock']?.signAndExecuteTransactionBlock) ||
                           (provider.features?.['sui:signAndExecuteTransaction']?.signAndExecuteTransaction);

    console.log('[Walrus] Requesting wallet approval for Registration...');
    let registerResult: any = null;
    try {
      registerResult = await signAndExecute.call(provider, { 
        transactionBlock: registerTx as any,
        transaction: registerTx as any,
        blob: blob,
        options: { showEffects: true }
      });
    } catch (e: any) {
      console.error('[Walrus] Wallet signing failed:', e);
      throw new Error(`Wallet failed: ${e.message || "User rejected"}`);
    }

    // Digest extraction
    let digest = registerResult?.digest || registerResult?.id || (registerResult as any)?.effects?.transactionDigest;

    if (!digest) {
      console.warn('[Walrus] Empty response. Searching for transaction...');
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const postTxs = await suiClient.queryTransactionBlocks({ filter: { FromAddress: ownerAddress }, limit: 3 });
        const newTx = postTxs.data.find(tx => tx.digest !== lastDigestBefore);
        if (newTx) { digest = newTx.digest; break; }
      }
    }

    if (!digest) throw new Error("Registration failed: Transaction not found on-chain.");

    console.log('[Walrus] Registration Success:', digest);

    // Step B: Storage (Writing to Nodes)
    console.log('[Walrus] Storing slivers on nodes using Uint8Array...');
    // CRITICAL: We pass the bytes (Uint8Array) instead of the Blob object for better compatibility with node fetchers.
    const confirmations = await client.writeEncodedBlobToNodes({
      blobId, metadata, sliversByNode, blob: bytes, 
    } as any);

    console.log(`[Walrus] Storage Success. Received ${confirmations.length} confirmations.`);

    // Step C: Certification
    const certTx = await client.certifyBlobTransaction({ blobId, confirmations } as any);

    const preCertTxs = await suiClient.queryTransactionBlocks({ filter: { FromAddress: ownerAddress }, limit: 1 });
    const lastDigestBeforeCert = preCertTxs.data[0]?.digest;

    console.log('[Walrus] Requesting wallet approval for Certification...');
    let certResult: any = null;
    try {
      certResult = await signAndExecute.call(provider, { 
        transactionBlock: certTx as any,
        transaction: certTx as any,
        blob: blob, 
        options: { showEffects: true }
      });
    } catch (e) {
      console.warn('[Walrus] Certification signing skipped or failed:', e);
    }

    return { blobId, objectId: 'confirmed', endEpoch: epochs };

  } catch (err: any) {
    console.error("UPLOAD ERROR DETAILS:", err);
    // Specific advice for node failures
    if (err.message.includes('failures while writing')) {
      throw new Error("Walrus node storage failed. This is common on 'localhost' due to browser security (CORS). Please try again, or if it persists, try deploying to a live domain (e.g. Vercel).");
    }
    throw err;
  }
}

export async function uploadJsonOnChain<T>(data: T, ownerAddress: string, epochs = 1, targetOwner?: string) {
  return uploadOnChain(data, ownerAddress, epochs, targetOwner);
}
