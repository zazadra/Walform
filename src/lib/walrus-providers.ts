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
/**
 * Verified active Walrus Mainnet publishers/relays.
 *
 * NOTE: As of 2026-05, there are no public, unauthenticated publishers on Mainnet.
 * All uploads MUST use the Walrus SDK (which utilizes the user's wallet for registration)
 * and an Upload Relay.
 */
export const WALRUS_PROVIDERS: WalrusProvider[] = [
  {
    name: 'Mysten Labs Relay',
    // This is an SDK Relay host, not a standalone publisher.
    uploadUrl: 'https://upload-relay.mainnet.walrus.space',
    method: 'PUT',
    apiVersion: 'v1',
    streaming: true,
    supportedParams: ['send_object_to'],
  },
];

/**
 * Verified active Walrus Mainnet aggregators for reads.
 */
export const WALRUS_AGGREGATORS: string[] = [
  'https://aggregator.walrus-mainnet.walrus.space',
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
