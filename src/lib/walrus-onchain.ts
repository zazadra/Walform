/**
 * Walrus On-Chain Integration
 * - Public Sui mainnet RPC (no Tatum — avoids CORS issues from browser)
 * - Move contract interactions for form/submission indexing
 */

import type { WalrusUploadResponse } from '@/types/walform';
import type { WalrusSigner } from '@/lib/walrus';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const WALFORM_PACKAGE_ID: string =
  '0xebb99d93ce26307c536308339144b05c32c0ac20f04156b61b1805e713a11693';

// ---------------------------------------------------------------------------
// Sui client — public mainnet RPC, no Tatum
// ---------------------------------------------------------------------------

const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io';

let _suiClient: SuiJsonRpcClient | null = null;

/** Returns a singleton Sui JSON-RPC client using the public mainnet fullnode. */
export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    _suiClient = new SuiJsonRpcClient({ url: SUI_MAINNET_RPC, network: 'mainnet' });
  }
  return _suiClient;
}

// ---------------------------------------------------------------------------
// Upload entry point
// ---------------------------------------------------------------------------

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

  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof Blob || data instanceof File) {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(data));
  }

  return await uploadBytesToWalrus(bytes, signer, epochs, (p) =>
    onProgress?.({ message: p.message ?? `Status: ${p.status}` }),
  );
}

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

export async function createFormObject(formId: string, configJson: string, _ownerAddress: string) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.setSender(_ownerAddress);
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::create_form`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(configJson),
      txb.pure.u64(BigInt(Date.now())),
    ],
  });
  return txb;
}

export async function createSubmissionObject(
  formId: string,
  payloadJson: string,
  status: string,
  owner: string,
) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.setSender(owner);
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::register_submission`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(payloadJson),
      txb.pure.u64(BigInt(Date.now())),
      txb.pure.string(status),
      txb.pure.address(owner),
    ],
  });
  return txb;
}

// ---------------------------------------------------------------------------
// Read Sui objects for form/submission discovery
// ---------------------------------------------------------------------------

/**
 * Given a Sui Form object ID, returns the config_json stored inside it.
 * This is the key bridge: URL uses objectId, configuration lives directly in Sui.
 */
export async function getFormByObjectId(objectId: string): Promise<{
  configJson: string;
  formId: string;
  createdAt: number;
} | null> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({
      id: objectId,
      options: { showContent: true },
    });
    if (obj.data?.content?.dataType !== 'moveObject') return null;
    const fields = (obj.data.content as any).fields as Record<string, string>;
    return {
      configJson: fields.config_json,
      formId: fields.form_id,
      createdAt: Number(fields.created_at ?? 0),
    };
  } catch (e) {
    console.error('[Sui] getFormByObjectId failed:', e);
    return null;
  }
}

/**
 * Query Submission objects owned by a wallet address.
 * Returns array of { suiObjectId, payloadJson, formId, submitter, timestamp, status }
 */
export async function getOwnedSubmissions(ownerAddress: string, formObjectId?: string): Promise<Array<{
  suiObjectId: string;
  payloadJson: string;
  formId: string;
  submitter: string;
  timestamp: number;
  status: string;
}>> {
  try {
    const client = getSuiClient();
    const resp = await client.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: `${WALFORM_PACKAGE_ID}::walform::Submission` },
      options: { showContent: true },
    });
    const results = [];
    for (const item of resp.data) {
      if (item.data?.content?.dataType !== 'moveObject') continue;
      const fields = (item.data.content as any).fields as Record<string, string>;
      // If filtering by formObjectId, only return submissions for that form
      if (formObjectId && fields.form_id !== formObjectId) continue;
      results.push({
        suiObjectId: item.data.objectId,
        payloadJson: fields.payload_json,
        formId: fields.form_id,
        submitter: fields.submitter,
        timestamp: Number(fields.timestamp ?? 0),
        status: fields.status ?? 'new',
      });
    }
    return results;
  } catch (e) {
    console.error('[Sui] getOwnedSubmissions failed:', e);
    return [];
  }
}

/**
 * Query Form objects owned by a wallet address.
 */
export async function getOwnedForms(ownerAddress: string): Promise<Array<{
  suiObjectId: string;
  configJson: string;
  formId: string;
  createdAt: number;
}>> {
  try {
    const client = getSuiClient();
    const resp = await client.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: `${WALFORM_PACKAGE_ID}::walform::Form` },
      options: { showContent: true },
    });
    return resp.data
      .filter(item => item.data?.content?.dataType === 'moveObject')
      .map(item => {
        const fields = (item.data!.content as any).fields as Record<string, string>;
        return {
          suiObjectId: item.data!.objectId,
          configJson: fields.config_json,
          formId: fields.form_id,
          createdAt: Number(fields.created_at ?? 0),
        };
      });
  } catch (e) {
    console.error('[Sui] getOwnedForms failed:', e);
    return [];
  }
}

