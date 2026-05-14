/**
 * Walrus Mainnet Publisher Provider Registry
 *
 * Each provider entry is fully self-describing:
 * - uploadUrl: The exact PUT/POST endpoint for blob upload
 * - method:    HTTP method required by that provider
 * - apiVersion: Walrus API version supported
 * - streaming:  Whether chunked/streaming body is accepted
 *
 * Validation order: DNS → health → upload-route probe (lazy, on first use).
 *
 * Sources verified 2026-05-10:
 *   - https://docs.wal.app/
 *   - https://github.com/MystenLabs/awesome-walrus
 *   - https://docs.nami.cloud/api-reference/walrus/
 */

export type WalrusApiVersion = 'v1';
export type HttpMethod = 'PUT' | 'POST';

export interface WalrusProvider {
  /** Human-readable name shown in logs and error messages */
  name: string;
  /** Full upload endpoint URL (path already included) */
  uploadUrl: string;
  /** HTTP method for the upload endpoint */
  method: HttpMethod;
  /** API version this provider supports */
  apiVersion: WalrusApiVersion;
  /** Whether the provider accepts streaming (chunked Transfer-Encoding) */
  streaming: boolean;
  /**
   * Query params accepted by this provider.
   * - 'send_object_to': standard across all v1 providers
   * Note: 'epochs' was removed from the Walrus public API; omit it.
   */
  supportedParams: ('send_object_to')[];
}

/**
 * Verified active Walrus Mainnet publishers as of 2026-05-10.
 *
 * Ordering: most reliable first (used as primary).
 * DNS-verified domains are marked with their resolved IPs in comments.
 */
export const WALRUS_PROVIDERS: WalrusProvider[] = [
  {
    name: 'Staketab Mainnet',
    uploadUrl: 'https://walrus-mainnet-publisher-1.staketab.org/v1/blobs',
    method: 'PUT',
    apiVersion: 'v1',
    streaming: true,
    supportedParams: ['send_object_to'],
  },
  {
    name: 'NodesGuru Mainnet',
    uploadUrl: 'https://walrus-mainnet-publisher.nodes.guru/v1/blobs',
    method: 'PUT',
    apiVersion: 'v1',
    streaming: true,
    supportedParams: ['send_object_to'],
  },
  {
    name: 'NodeInfra Mainnet',
    uploadUrl: 'https://walrus-mainnet-publisher.nodeinfra.com/v1/blobs',
    method: 'PUT',
    apiVersion: 'v1',
    streaming: true,
    supportedParams: ['send_object_to'],
  },
  {
    name: 'Mysten Labs (Standard)',
    uploadUrl: 'https://publisher.walrus.space/v1/blobs',
    method: 'PUT',
    apiVersion: 'v1',
    streaming: true,
    supportedParams: ['send_object_to'],
  },
  {
    name: 'Mysten Labs (Mainnet)',
    uploadUrl: 'https://publisher.mainnet.walrus.space/v1/blobs',
    method: 'PUT',
    apiVersion: 'v1',
    streaming: true,
    supportedParams: ['send_object_to'],
  },
];

/**
 * Verified active Walrus Mainnet aggregators for reads.
 * Aggregator.walrus-mainnet.walrus.space is DNS-confirmed (Cloudflare IPs).
 */
export const WALRUS_AGGREGATORS: string[] = [
  'https://aggregator.walrus-mainnet.walrus.space', // DNS: 104.18.36.9, 172.64.151.247
  'https://wal-aggregator-mainnet.staketab.org',
];

export const PRIMARY_AGGREGATOR = WALRUS_AGGREGATORS[0];

/** Build the upload URL with only the supported query params for a given provider. */
export function buildUploadUrl(
  provider: WalrusProvider,
  opts: { sendObjectTo?: string } = {},
): string {
  const params = new URLSearchParams();

  if (opts.sendObjectTo && provider.supportedParams.includes('send_object_to')) {
    params.set('send_object_to', opts.sendObjectTo);
  }

  const qs = params.toString();
  return qs ? `${provider.uploadUrl}?${qs}` : provider.uploadUrl;
}

/** Categorise an error into one of three failure classes for better user messages. */
export function classifyError(err: unknown): {
  kind: 'dns' | 'api_mismatch' | 'provider_down' | 'unknown';
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err);

  if (/ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) {
    return { kind: 'dns', message: `DNS failure – provider domain does not resolve` };
  }
  if (/unknown field|400|405|unsupported/i.test(msg)) {
    return { kind: 'api_mismatch', message: `API mismatch – provider rejected the request format` };
  }
  if (/502|503|504|timeout|ECONNRESET/i.test(msg)) {
    return { kind: 'provider_down', message: `Provider temporarily down (${msg})` };
  }
  return { kind: 'unknown', message: msg };
}
