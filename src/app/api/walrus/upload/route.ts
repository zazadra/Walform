import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { URL } from 'url';
import {
  WALRUS_PROVIDERS,
  buildUploadUrl,
  classifyError,
  type WalrusProvider,
} from '@/lib/walrus-providers';

// Node.js runtime required for native 'https' module and longer timeouts
export const runtime = 'nodejs';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Core HTTP transport (native https – avoids undici/fetch quirks on Vercel)
// ---------------------------------------------------------------------------

function httpsRequest(
  urlStr: string,
  method: string,
  buffer: Buffer,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);

    const req = https.request(
      {
        method,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': buffer.length,
          'User-Agent': 'Walform-Relay/2.0',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          const status = res.statusCode ?? 0;

          if (status >= 200 && status < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              // Non-JSON 2xx – unlikely for Walrus but handle gracefully
              resolve({ raw: body });
            }
          } else {
            // Strip HTML tags from error bodies (e.g. CloudFlare error pages)
            const clean = body.replace(/<[^>]*>/g, '').trim().slice(0, 200);
            reject(new Error(`HTTP ${status}: ${clean || res.statusMessage}`));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs / 1000}s`));
    });

    req.on('error', reject);

    req.write(buffer);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Upload against a single provider – structured error on failure
// ---------------------------------------------------------------------------

interface ProviderResult {
  ok: true;
  data: Record<string, unknown>;
  provider: WalrusProvider;
}
interface ProviderError {
  ok: false;
  provider: WalrusProvider;
  kind: 'dns' | 'api_mismatch' | 'provider_down' | 'unknown';
  message: string;
}

async function tryProvider(
  provider: WalrusProvider,
  buffer: Buffer,
  opts: { sendObjectTo?: string },
): Promise<ProviderResult | ProviderError> {
  const url = buildUploadUrl(provider, opts);
  console.log(`[Relay] ${provider.method} → ${url} (${buffer.length} bytes) [${provider.name}]`);

  try {
    const data = await httpsRequest(url, provider.method, buffer);
    console.log(`[Relay] ✓ SUCCESS via ${provider.name}`);
    return { ok: true, data, provider };
  } catch (err: unknown) {
    const { kind, message } = classifyError(err);
    console.warn(`[Relay] ✗ FAIL [${provider.name}] ${kind}: ${message}`);
    return { ok: false, provider, kind, message };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Note: 'epochs' is intentionally NOT forwarded – it was removed from the
    // Walrus public publisher API. Blobs now use network-default storage duration.
    const sendObjectTo = searchParams.get('send_object_to') ?? undefined;

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const errors: string[] = [];

    for (const provider of WALRUS_PROVIDERS) {
      const result = await tryProvider(provider, buffer, { sendObjectTo });

      if (result.ok) {
        return NextResponse.json(result.data);
      }

      // Build a human-readable error entry
      errors.push(`[${provider.name}] ${result.kind}: ${result.message}`);

      // Short back-off before next provider to avoid thundering-herd on the
      // same infrastructure (several providers share Cloudflare WAF)
      await new Promise((r) => setTimeout(r, 400));
    }

    return NextResponse.json(
      {
        error: 'All Walrus publishers failed',
        detail: errors,
        hint: 'Check https://github.com/MystenLabs/awesome-walrus for updated publisher endpoints',
      },
      { status: 502 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Relay] Unhandled error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
