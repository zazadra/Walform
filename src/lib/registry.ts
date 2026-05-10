import { readJsonFromWalrus, uploadJsonToWalrus } from './walrus';
import { getSuiClient } from './walrus-onchain';
import { decodeBlobId } from './form-registry';
import type { Submission } from '@/types/walform';

export interface FormRegistryData {
  type: 'form_registry';
  formId: string;
  owner: string;
  version: number;
  submissionBlobIds: string[];
  lastUpdated: number;
}

const WALRUS_BLOB_TYPE = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob';

// In-memory cache to avoid repeated scans in same session
const registryCache = new Map<string, string>(); 

/**
 * Finds the latest Form Registry blob for a specific form owned by a wallet.
 */
export async function getFormRegistry(owner: string, formId: string): Promise<FormRegistryData | null> {
  const cacheKey = `${owner}:${formId}`;
  const cachedBlobId = registryCache.get(cacheKey);
  
  if (cachedBlobId) {
    try {
      const data = await readJsonFromWalrus<FormRegistryData>(cachedBlobId);
      if (data?.type === 'form_registry') return data;
    } catch {
      registryCache.delete(cacheKey); // Stale cache
    }
  }

  const client = getSuiClient();
  console.log(`[Registry] Scanning for registry of form ${formId} owned by ${owner}...`);

  try {
    const res = await client.getOwnedObjects({
      owner,
      filter: { StructType: WALRUS_BLOB_TYPE },
      options: { showContent: true },
      limit: 50,
    });

    const candidates = await Promise.all(res.data.map(async (obj) => {
      const fields = (obj.data?.content as any)?.fields;
      if (!fields?.blob_id) return null;
      try {
        const blobId = decodeBlobId(String(fields.blob_id));
        const data = await readJsonFromWalrus<any>(blobId);
        if (data?.type === 'form_registry' && data.formId === formId && data.owner === owner) {
          return { blobId, version: data.version || 0, data: data as FormRegistryData };
        }
      } catch { return null; }
      return null;
    }));

    const valid = candidates.filter((r): r is NonNullable<typeof r> => r !== null);
    if (valid.length === 0) return null;

    valid.sort((a, b) => b.version - a.version);
    const best = valid[0];
    registryCache.set(cacheKey, best.blobId);
    return best.data;
  } catch (err) {
    console.error('[Registry] Fetch failed:', err);
    return null;
  }
}

/**
 * Appends a submission to the form's registry.
 */
export async function updateFormRegistry(
  owner: string,
  formId: string,
  submissionBlobId: string,
  sender: string
): Promise<string | null> {
  if (!owner || !formId) return null;
  
  console.log(`[Registry] Updating registry for form ${formId}...`);
  
  // 1. Fetch current
  const current = await getFormRegistry(owner, formId);
  
  // 2. Prepare update
  const ids = current?.submissionBlobIds || [];
  if (ids.includes(submissionBlobId)) return null;

  const updated: FormRegistryData = {
    type: 'form_registry',
    formId,
    owner,
    version: (current?.version || 0) + 1,
    submissionBlobIds: [...ids, submissionBlobId],
    lastUpdated: Date.now(),
  };

  // 3. Upload and send to owner
  try {
    const { blobId } = await uploadJsonToWalrus(updated, 5, owner);
    console.log(`[Registry] Form registry updated to v${updated.version}`);
    return blobId;
  } catch (err) {
    console.error('[Registry] Update failed:', err);
    return null;
  }
}

/**
 * Queries Sui directly for Submission objects owned by the wallet.
 */
export async function getSuiNativeSubmissions(owner: string, packageId: string, formId?: string): Promise<string[]> {
  const client = getSuiClient();
  const subType = `${packageId}::walform::Submission`;
  
  try {
    const res = await client.getOwnedObjects({
      owner,
      filter: { StructType: subType },
      options: { showContent: true },
      limit: 100,
    });

    const ids = res.data.map(obj => {
      const content = (obj.data?.content as any)?.fields;
      if (formId && content?.form_id !== formId) return null;
      return content?.walrus_blob_id as string;
    }).filter((id): id is string => Boolean(id));

    return ids;
  } catch (err) {
    console.error('[SuiNative] Query failed:', err);
    return [];
  }
}

/**
 * Queries Sui directly for Form objects owned by the wallet.
 */
export async function getSuiNativeForms(owner: string, packageId: string): Promise<string[]> {
  const client = getSuiClient();
  const formType = `${packageId}::walform::Form`;
  
  try {
    const res = await client.getOwnedObjects({
      owner,
      filter: { StructType: formType },
      options: { showContent: true },
      limit: 50,
    });

    const ids = res.data.map(obj => {
      const content = (obj.data?.content as any)?.fields;
      return content?.blob_id as string;
    }).filter((id): id is string => Boolean(id));

    return ids;
  } catch (err) {
    console.error('[SuiNativeForms] Query failed:', err);
    return [];
  }
}
