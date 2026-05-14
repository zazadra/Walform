import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { URL } from 'url';
import {
  WALRUS_PROVIDERS,
  buildUploadUrl,
  classifyError,
  type WalrusProvider,
} from '@/lib/walrus-providers';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Streaming HTTPS Request
 * Pipes the incoming request stream directly to the Walrus publisher.
 */
/**
 * Buffered HTTPS Request (Allows Retries)
 */
async function streamHttpsRequestFromBuffer(
  urlStr: string,
  method: string,
  buffer: ArrayBuffer,
  incomingHeaders: Headers,
  timeoutMs = 55_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const headers: Record<string, string> = {
        'Content-Type': incomingHeaders.get('Content-Type') || 'application/octet-stream',
        'User-Agent': 'Walform-Relay/3.0',
        'Content-Length': buffer.byteLength.toString(),
      };

      const outgoing = https.request(
        {
          method,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : 443,
          path: url.pathname + url.search,
          headers,
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
                resolve({ raw: body });
              }
            } else {
              const clean = body.replace(/<[^>]*>/g, '').trim().slice(0, 200);
              reject(new Error(`HTTP ${status}: ${clean || res.statusMessage}`));
            }
          });
        },
      );

      outgoing.on('timeout', () => {
        outgoing.destroy();
        reject(new Error(`Timeout after ${timeoutMs / 1000}s`));
      });

      outgoing.on('error', reject);
      outgoing.write(Buffer.from(buffer));
      outgoing.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Upload against a provider.
 * Since we are streaming, we can only try ONE provider per request because the stream
 * can only be consumed once.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sendObjectTo = searchParams.get('send_object_to') ?? undefined;

    // We try multiple providers if one fails. 
    // Since we are using NextRequest, we need to clone it or buffer the body to retry.
    const bodyBuffer = await req.arrayBuffer();
    
    let lastError: any;
    // Try up to 3 providers
    for (let i = 0; i < Math.min(3, WALRUS_PROVIDERS.length); i++) {
      const provider = WALRUS_PROVIDERS[i];
      const url = buildUploadUrl(provider, { sendObjectTo });

      console.log(`[Relay] ${provider.method} → ${url} [${provider.name}] (Attempt ${i+1})`);

      try {
        // Create a new mock-like request object for the streamer or just use the buffer
        const data = await streamHttpsRequestFromBuffer(url, provider.method, bodyBuffer, req.headers);
        console.log(`[Relay] ✓ SUCCESS via ${provider.name}`);
        return NextResponse.json(data);
      } catch (err: any) {
        lastError = err;
        console.warn(`[Relay] ✗ FAIL [${provider.name}]: ${err.message}`);
      }
    }

    const { kind, message } = classifyError(lastError);
    return NextResponse.json(
      { 
        error: 'Relay upload failed after multiple attempts', 
        detail: message,
        kind 
      }, 
      { status: 502 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Relay-Stream] Unhandled error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
