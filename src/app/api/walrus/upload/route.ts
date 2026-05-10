import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { URL } from 'url';

// Node.js runtime is required for 'https' module and longer timeouts
export const runtime = 'nodejs';
export const maxDuration = 60;

const PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.walrus.space/v1/blobs',
  'https://walrus-mainnet-publisher.nami.cloud/v1/store',
  'https://walrus-mainnet-publisher-1.staketab.org:443/v1/blobs',
  'https://walrus-mainnet-publisher.staketab.org/v1/blobs',
  'https://publisher.walrus.space/v1/blobs',
];

/**
 * Robust HTTP PUT using Node's native 'https' module.
 * This avoids 'fetch failed' issues common with undici/fetch in Vercel's Node environment
 * when talking to certain decentralized infrastructure nodes.
 */
function robustPut(urlStr: string, buffer: Buffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      method: 'PUT',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length,
        'User-Agent': 'Walform-Relay/1.1',
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data }); // Fallback if not JSON
          }
        } else {
          // Extract error message from HTML if needed
          const cleanErr = data.replace(/<[^>]*>/g, '').trim().substring(0, 100);
          reject(new Error(`HTTP ${res.statusCode}: ${cleanErr || res.statusMessage}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout (30s)'));
    });

    req.write(buffer);
    req.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = Math.max(1, parseInt(searchParams.get('epochs') || '5', 10));
    const sendObjectTo = searchParams.get('send_object_to');

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const errors: string[] = [];

    for (const baseUrl of PUBLISHER_POOL) {
      // Append query params to the base URL (which now includes the path)
      let url = `${baseUrl}?epochs=${epochs}`;
      if (sendObjectTo) url += `&send_object_to=${sendObjectTo}`;

      console.log(`[Relay] PUT → ${url} (${buffer.length} bytes)`);

      try {
        const result = await robustPut(url, buffer);
        console.log(`[Relay] SUCCESS via ${publisherUrl}`);
        return NextResponse.json(result);
      } catch (err: any) {
        console.warn(`[Relay] FAIL ${publisherUrl}: ${err.message}`);
        errors.push(`${publisherUrl.replace('https://', '')}: ${err.message}`);
        // Optional: slight delay before trying next node
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
    }

    const summary = errors.join(' | ');
    return NextResponse.json(
      { error: `Walrus Publishers exhausted. Last errors: ${summary}` },
      { status: 502 },
    );

  } catch (error: any) {
    console.error('[Relay] Global Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
