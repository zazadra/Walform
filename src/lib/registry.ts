import { readJsonFromWalrus } from './walrus';
import { uploadJsonOnChain, getSuiClient } from './walrus-onchain';
import { decodeBlobId } from './form-registry';
import type { Submission } from '@/types/walform';

export interface SubmissionMetadata {
  blobId: string;
  formId: string;
  ownerWallet: string;
  createdAt: number;
  status: 'pending' | 'reviewed' | 'approved' | 'rejected';
}

export interface RegistryData {
  type: 'walform_registry';
  owner: string;
  version: number;
  submissions: SubmissionMetadata[];
  lastUpdated: number;
}

const WALRUS_BLOB_TYPE = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob';

/**
 * Finds the latest Walform Registry blob for a given wallet.
 * Scans owned objects and picks the one with the highest version.
 */
export async function getLatestRegistry(wallet: string): Promise<RegistryData | null> {
  const client = getSuiClient();
  console.log(`[Registry] Scanning for registry owned by ${wallet}...`);

  try {
    const res = await client.getOwnedObjects({
      owner: wallet,
      filter: { StructType: WALRUS_BLOB_TYPE },
      options: { showContent: true },
      limit: 20, // Check recent 20 objects for registry
    });

    const registryBlobs: { blobId: string; version: number; data: RegistryData }[] = [];

    const candidates = res.data.map(async (obj) => {
      const fields = (obj.data?.content as any)?.fields;
      if (!fields?.blob_id) return null;
      try {
        const blobId = decodeBlobId(String(fields.blob_id));
        const data = await readJsonFromWalrus<any>(blobId);
        if (data?.type === 'walform_registry' && data.owner === wallet) {
          return { blobId, version: data.version || 0, data };
        }
      } catch { return null; }
      return null;
    });

    const results = await Promise.all(candidates);
    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);

    if (valid.length === 0) return null;

    // Sort by version descending
    valid.sort((a, b) => b.version - a.version);
    console.log(`[Registry] Found latest version: ${valid[0].version}`);
    return valid[0].data;
  } catch (err) {
    console.error('[Registry] Failed to fetch registry:', err);
    return null;
  }
}

/**
 * Updates the registry for a form owner.
 * If no registry exists, creates one.
 */
export async function updateRegistry(
  ownerAddress: string,
  newSubmission: SubmissionMetadata,
  senderAddress: string
): Promise<string | null> {
  console.log(`[Registry] Updating registry for ${ownerAddress}...`);
  
  // 1. Fetch current
  let current = await getLatestRegistry(ownerAddress);
  
  // 2. Prepare new data
  const submissions = current?.submissions || [];
  
  // Check for duplicates
  if (submissions.some(s => s.blobId === newSubmission.blobId)) {
    console.log('[Registry] Submission already in registry.');
    return null;
  }

  const updated: RegistryData = {
    type: 'walform_registry',
    owner: ownerAddress,
    version: (current?.version || 0) + 1,
    submissions: [...submissions, newSubmission],
    lastUpdated: Date.now(),
  };

  // 3. Upload and send to owner
  try {
    const { blobId } = await uploadJsonOnChain(updated, senderAddress, 5, ownerAddress);
    console.log(`[Registry] Registry updated to v${updated.version}. New BlobId: ${blobId}`);
    return blobId;
  } catch (err) {
    console.error('[Registry] Update failed:', err);
    return null;
  }
}

/**
 * Helper to convert a Submission to SubmissionMetadata
 */
export function toMetadata(sub: Submission, blobId: string): SubmissionMetadata {
  return {
    blobId,
    formId: sub.formId || sub.formBlobId || '',
    ownerWallet: sub.submitterAddress || '',
    createdAt: sub.timestamp || Date.now(),
    status: sub.status || 'pending',
  };
}
