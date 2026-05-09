import { get, set, update } from 'idb-keyval';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'retrying';

export interface PendingFile {
  localId: string;
  walletAddress: string;
  file: File;
  status: SyncStatus;
  retryCount: number;
  walrusBlobId?: string;
  errorMessage?: string;
}

export interface PendingSubmission {
  localId: string;
  formBlobId: string;
  walletAddress: string;
  payload: any;
  status: SyncStatus;
  retryCount: number;
  adminWallet?: string;
  walrusBlobId?: string;
  errorMessage?: string;
  timestamp: number;
}

export interface WalletManifest {
  walletAddress: string;
  pendingSubmissions: string[];
  syncedSubmissions: string[];
  lastSync: number;
}

const FILES_KEY = 'walform:queue:files';
const SUBS_KEY = 'walform:queue:submissions';
const MANIFEST_PREFIX = 'walform:manifest:';

export async function getFileQueue(): Promise<PendingFile[]> {
  try { return (await get(FILES_KEY)) || []; } catch { return []; }
}

export async function getSubmissionQueue(): Promise<PendingSubmission[]> {
  try { return (await get(SUBS_KEY)) || []; } catch { return []; }
}

export async function saveFileQueue(queue: PendingFile[]): Promise<void> {
  await set(FILES_KEY, queue);
}

export async function saveSubmissionQueue(queue: PendingSubmission[]): Promise<void> {
  await set(SUBS_KEY, queue);
}

export async function getWalletManifest(walletAddress: string): Promise<WalletManifest> {
  const key = `${MANIFEST_PREFIX}${walletAddress}`;
  try {
    return (await get(key)) || { walletAddress, pendingSubmissions: [], syncedSubmissions: [], lastSync: 0 };
  } catch {
    return { walletAddress, pendingSubmissions: [], syncedSubmissions: [], lastSync: 0 };
  }
}

export async function saveWalletManifest(walletAddress: string, manifest: WalletManifest): Promise<void> {
  await set(`${MANIFEST_PREFIX}${walletAddress}`, manifest);
}

export async function queueFile(walletAddress: string, file: File): Promise<string> {
  const localId = `local_file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const queue = await getFileQueue();
  queue.push({
    localId,
    walletAddress,
    file,
    status: 'pending',
    retryCount: 0
  });
  await saveFileQueue(queue);
  return localId;
}

export async function queueSubmission(walletAddress: string, formBlobId: string, payload: any, adminWallet?: string): Promise<string> {
  const localId = `local_sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const queue = await getSubmissionQueue();
  queue.push({
    localId,
    formBlobId,
    walletAddress,
    payload,
    status: 'pending',
    retryCount: 0,
    adminWallet,
    timestamp: Date.now()
  });
  await saveSubmissionQueue(queue);
  
  const manifest = await getWalletManifest(walletAddress);
  manifest.pendingSubmissions.push(localId);
  await saveWalletManifest(walletAddress, manifest);

  return localId;
}
