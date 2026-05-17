/**
 * Walrus On-Chain Integration
 * - Public Sui mainnet RPC (no Tatum — avoids CORS issues from browser)
 * - Move contract interactions for form/submission indexing
 */

import type { WalrusUploadResponse } from '@/types/walform';
import type { WalrusSigner } from '@/lib/walrus';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { get as idbGet, set as idbSet } from 'idb-keyval';

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
  // Sender is automatically set by the signing wallet
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
  // Sender is automatically set by the signing wallet
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
  suiObjectId: string;
  configJson: string;
  formId: string;
  createdAt: number;
  owner?: string;
} | null> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({
      id: objectId,
      options: { showContent: true },
    });
    if (obj.data?.content?.dataType !== 'moveObject') return null;
    const fields = (obj.data.content as any).fields as Record<string, string>;
    const ownerInfo = obj.data.owner;
    let ownerAddress = '';
    if (ownerInfo && typeof ownerInfo === 'object') {
      if ('AddressOwner' in ownerInfo) ownerAddress = ownerInfo.AddressOwner as string;
    }
    return {
      suiObjectId: objectId, // ← critical: allows forms.find(f => f.suiObjectId) to work
      configJson: fields.config_json,
      formId: fields.form_id,
      createdAt: Number(fields.created_at ?? 0),
      owner: ownerAddress,
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
  note: string;
}>> {
  try {
    const client = getSuiClient();

    // Reverting to global query for discovery, but we will filter in UI.
    // This ensures that even if objects are transferred or shared, they can be discovered.
    const txResp = await (client as any).queryTransactionBlocks({
      filter: { MoveFunction: { package: WALFORM_PACKAGE_ID, module: 'walform', function: 'register_submission' } },
      options: { showObjectChanges: true, showEffects: true },
      limit: 100,
    });

    const subObjectIds: string[] = [];
    for (const tx of (txResp?.data ?? [])) {
      for (const change of (tx.objectChanges ?? [])) {
          if (
            change.type === 'created' &&
            typeof change.objectType === 'string' &&
            change.objectType.includes('::walform::Submission')
          ) {
            subObjectIds.push(change.objectId);
          }
        }
      }

      if (subObjectIds.length === 0) return [];

      const multiResp = await client.multiGetObjects({
        ids: subObjectIds,
        options: { showContent: true },
      });

      const results = [];
      for (const item of multiResp) {
        if (item.data?.content?.dataType !== 'moveObject') continue;
        const fields = (item.data.content as any).fields as Record<string, string>;
        
        // CRITICAL: Filter by formId to prevent cross-form discovery leaks
        if (formObjectId && fields.form_id !== formObjectId) continue;
        
        const [localStatus, localNote] = await Promise.all([
          idbGet(`walform_status_${item.data.objectId}`),
          idbGet(`walform_note_${item.data.objectId}`)
        ]);
        
        results.push({
          suiObjectId: item.data.objectId,
          payloadJson: fields.payload_json,
          formId: fields.form_id,
          submitter: fields.submitter,
          timestamp: Number(fields.timestamp ?? 0),
          status: (localStatus as string) ?? fields.status ?? 'new',
          note: (localNote as string) ?? '',
        });
      }
      return results.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.error('[Sui] getOwnedSubmissions failed:', e);
    return [];
  }
}

/**
 * Persist submission status locally since the contract is read-only for these fields.
 */
export async function updateSubmissionStatus(objectId: string, status: string) {
  await idbSet(`walform_status_${objectId}`, status);
}

/**
 * Persist submission notes locally since the contract is read-only for these fields.
 */
export async function updateSubmissionNote(objectId: string, note: string) {
  await idbSet(`walform_note_${objectId}`, note);
}

/**
 * Get the list of co-admin wallet addresses for a specific form (stored locally).
 * Co-admins can view submissions without being the Sui object owner.
 */
export async function getFormCoAdmins(formObjectId: string): Promise<string[]> {
  const raw = await idbGet(`walform_coadmins_${formObjectId}`);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Save the list of co-admin wallet addresses for a specific form.
 */
export async function setFormCoAdmins(formObjectId: string, admins: string[]): Promise<void> {
  await idbSet(`walform_coadmins_${formObjectId}`, admins);
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
        const ownerInfo = item.data!.owner;
        let ownerAddress = '';
        if (ownerInfo && typeof ownerInfo === 'object') {
          if ('AddressOwner' in ownerInfo) ownerAddress = ownerInfo.AddressOwner as string;
        }
        return {
          suiObjectId: item.data!.objectId,
          configJson: fields.config_json,
          formId: fields.form_id,
          createdAt: Number(fields.created_at ?? 0),
          owner: ownerAddress,
        };
      });
  } catch (e) {
    console.error('[Sui] getOwnedForms failed:', e);
    return [];
  }
}

