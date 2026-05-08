/**
 * Walrus HTTP API - Direct Browser Uploads
 * We use the public Walrus Publisher for static dApps (no backend needed).
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet';
export const WALRUS_AGGREGATOR = 'https://aggregator.mainnet.walrus.space';
export const WALRUS_PUBLISHER  = 'https://publisher.mainnet.walrus.space';

console.log("NETWORK:", NETWORK);
console.log("AGGREGATOR:", WALRUS_AGGREGATOR);
console.log("PUBLISHER:", WALRUS_PUBLISHER);

function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  if (result.newlyCreated) {
    const blob = (result.newlyCreated as Record<string, unknown>).blobObject as Record<string, unknown>;
    return {
      blobId:   blob.blobId as string,
      objectId: blob.id as string,
      endEpoch: (blob.storage as Record<string, unknown>)?.endEpoch as number,
    };
  }
  if (result.alreadyCertified) {
    const ac = result.alreadyCertified as Record<string, unknown>;
    return {
      blobId:   ac.blobId as string,
      objectId: ((ac.event as Record<string, unknown>)?.txDigest as string) ?? '',
      endEpoch: ac.endEpoch as number,
    };
  }
  throw new Error('Unexpected Walrus response: ' + JSON.stringify(result));
}

/**
 * Core upload function using the public Publisher.
 * @param sendObjectTo - Sui address to send the resulting Blob object to (for on-chain ownership)
 */
export async function uploadBytesToWalrus(
  data: Uint8Array | string,
  epochs = 5,
  sendObjectTo?: string
): Promise<WalrusUploadResponse> {
  let url = `${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`;
  if (sendObjectTo) url += `&send_object_to=${sendObjectTo}`;
  const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const res = await fetch(url, { method: 'PUT', body: body as any });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  return parseWalrusResponse(await res.json());
}

/**
 * Upload JSON directly to Walrus.
 * @param sendObjectTo - Sui address to send the resulting Blob object to (for on-chain ownership)
 */
export async function uploadJsonToWalrus<T>(
  data: T,
  epochs = 5,
  sendObjectTo?: string
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), epochs, sendObjectTo);
}

/**
 * Uploads a file directly to the Walrus Publisher from the browser.
 */
export async function uploadFileToWalrus(file: File, epochs = 1): Promise<WalrusUploadResponse> {
  const url = `${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`;
  const res = await fetch(url, { method: 'PUT', body: file });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Walrus Upload failed (${res.status}): ${errorText}`);
  }

  const result = await res.json();
  return parseWalrusResponse(result);
}

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Read failed (${res.status}) for ${blobId}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function readJsonFromWalrus<T>(blobId: string): Promise<T> {
  const bytes = await readBlobFromWalrus(blobId);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export function getWalrusBlobUrl(blobId: string) {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}

export function getWalrusScanUrl(blobId: string) {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
