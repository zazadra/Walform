import { 
  getFileQueue, 
  getSubmissionQueue, 
  saveFileQueue, 
  saveSubmissionQueue, 
  getWalletManifest, 
  saveWalletManifest,
} from './local-storage';
import { uploadBytesToWalrus } from './walrus';

// Dispatch events when sync status changes so UI can react.
export function emitSyncEvent(status: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('walform:sync_status', { detail: status }));
  }
}

// Deep replace local_file_ IDs with walrus BlobIds in the payload
function resolveFileIdsInPayload(payload: any, localIdToBlobId: Record<string, string>): any {
  if (Array.isArray(payload)) {
    return payload.map(item => resolveFileIdsInPayload(item, localIdToBlobId));
  } else if (payload !== null && typeof payload === 'object') {
    const newPayload: any = {};
    for (const key in payload) {
      if (typeof payload[key] === 'string' && payload[key].startsWith('local_file_')) {
        newPayload[key] = localIdToBlobId[payload[key]] || payload[key];
      } else if (Array.isArray(payload[key])) {
        newPayload[key] = payload[key].map((item: any) => 
          typeof item === 'string' && item.startsWith('local_file_') 
            ? localIdToBlobId[item] || item 
            : resolveFileIdsInPayload(item, localIdToBlobId)
        );
      } else {
        newPayload[key] = resolveFileIdsInPayload(payload[key], localIdToBlobId);
      }
    }
    return newPayload;
  }
  return payload;
}

export async function processSyncQueue() {
  try {
    // 1. Process File Queue
    const fileQueue = await getFileQueue();
    let filesChanged = false;
    
    for (const item of fileQueue) {
      if (item.status === 'pending' || item.status === 'retrying') {
        emitSyncEvent(`Syncing file ${item.localId.slice(0, 15)}...`);
        item.status = 'syncing';
        await saveFileQueue(fileQueue); // Save 'syncing' status
        
        try {
          const result = await uploadBytesToWalrus(item.file, 3);
          item.walrusBlobId = result.blobId;
          item.status = 'synced';
          emitSyncEvent(`File synced: ${result.blobId}`);
        } catch (err: any) {
          item.status = 'retrying';
          item.retryCount++;
          item.errorMessage = err.message || 'Unknown error';
          emitSyncEvent(`File sync failed, retrying... (${item.retryCount})`);
        }
        filesChanged = true;
      }
    }
    
    if (filesChanged) await saveFileQueue(fileQueue);

    // Build map of local -> blobId for synced files
    const localIdToBlobId: Record<string, string> = {};
    for (const item of fileQueue) {
      if (item.status === 'synced' && item.walrusBlobId) {
        localIdToBlobId[item.localId] = item.walrusBlobId;
      }
    }

    // 2. Process Submission Queue
    const subQueue = await getSubmissionQueue();
    let subsChanged = false;

    for (const sub of subQueue) {
      if (sub.status === 'pending' || sub.status === 'retrying') {
        
        // Deep scan payload for local_file_
        const payloadString = JSON.stringify(sub.payload);
        const matches = payloadString.match(/local_file_[a-zA-Z0-9_]+/g) || [];
        const unresolvedFiles = matches.filter(localId => !localIdToBlobId[localId]);

        if (unresolvedFiles.length > 0) {
          emitSyncEvent(`Waiting for ${unresolvedFiles.length} files to sync...`);
          continue;
        }

        emitSyncEvent(`Syncing submission to Walrus...`);
        sub.status = 'syncing';
        await saveSubmissionQueue(subQueue);

        const resolvedPayload = resolveFileIdsInPayload(sub.payload, localIdToBlobId);

        try {
          // Dynamic import to avoid breaking SSR or non-browser environments
          const { uploadOnChain } = await import('./walrus-onchain');
          
          const { blobId } = await uploadOnChain(
            JSON.stringify(resolvedPayload),
            sub.walletAddress,
            5,
            sub.adminWallet
          );

          sub.walrusBlobId = blobId;
          sub.status = 'synced';
          
          // Update Manifest
          const manifest = await getWalletManifest(sub.walletAddress);
          manifest.pendingSubmissions = manifest.pendingSubmissions.filter(id => id !== sub.localId);
          manifest.syncedSubmissions.push(blobId);
          manifest.lastSync = Date.now();
          await saveWalletManifest(sub.walletAddress, manifest);

          emitSyncEvent(`Submission fully synced to Walrus!`);
        } catch (err: any) {
          sub.status = 'retrying';
          sub.retryCount++;
          sub.errorMessage = err.message || 'Unknown error';
          emitSyncEvent(`Submission sync failed, retrying... (${sub.retryCount})`);
        }
        subsChanged = true;
      }
    }

    if (subsChanged) await saveSubmissionQueue(subQueue);

  } catch (err) {
    console.error('Sync engine error:', err);
  }
}

let syncInterval: any;
export function startSyncEngine() {
  if (typeof window === 'undefined') return;
  if (syncInterval) return;

  // Run immediately
  processSyncQueue();

  // Then run every 10 seconds
  syncInterval = setInterval(() => {
    processSyncQueue();
  }, 10000);
}
