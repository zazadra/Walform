import { NextRequest, NextResponse } from 'next/server';

// Use Node.js runtime for longer timeout (no 30s edge limit)
export const runtime = 'nodejs';
export const maxDuration = 60; // 60s max per Vercel plan

// Most reliable Walrus mainnet publishers, ordered by reliability
const PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.mystenlabs.com', // Official, most reliable
  'https://publisher.walrus.space',
  'https://walrus-mainnet-publisher.staketab.org',
  'https://publisher-mainnet.walrus.nami.cloud',
  'https://publisher.walrus-mainnet.nodeinfra.com',
  'https://walrus-mainnet-publisher.chainode.tech',
  'https://walrus-mainnet-publisher-1.staketab.org',
  'https://publisher.walrus-mainnet.decentnode.com',
  'https://publisher.walrus-mainnet.blockscope.net',
];

const TIMEOUT_MS = 30_000; // 30s per publisher attempt

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = parseInt(searchParams.get('epochs') || '5', 10);
    const sendObjectTo = searchParams.get('send_object_to');

    // Buffer the request body
    const buffer = await req.arrayBuffer();
    
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const MAX_SIZE = 9 * 1024 * 1024; // 9MB — Walrus practical limit
    if (buffer.byteLength > MAX_SIZE) { 
      return NextResponse.json(
        { error: `File too large (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB). Max 9MB.` },
        { status: 413 }
      );
    }

    const errors: string[] = [];

    // Provider Rotation Loop
    for (const publisherUrl of PUBLISHER_POOL) {
      // Correct Walrus REST API: PUT /v1/blobs?epochs=N
      // - DO NOT pass `deletable=true` — blobs are deletable by default, 
      //   passing it explicitly causes "internal error" on some publishers
      // - Always include epochs
      let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
      if (sendObjectTo) url += `&send_object_to=${encodeURIComponent(sendObjectTo)}`;
      
      console.log(`[Relay] Trying ${publisherUrl} (${buffer.byteLength} bytes, ${epochs} epochs)`);

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: buffer,
          // @ts-ignore — duplex required in Node.js for streaming body
          duplex: 'half',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) {
          let errText = res.statusText;
          try { errText = await res.text(); } catch { /* ignore */ }
          console.warn(`[Relay] FAIL ${publisherUrl} | ${res.status} | ${errText.substring(0, 80)}`);
          errors.push(`${publisherUrl}: ${res.status} ${errText.substring(0, 80)}`);
          continue; 
        }

        const data = await res.json();
        console.log(`[Relay] SUCCESS ${publisherUrl}`);
        return NextResponse.json(data);

      } catch (err: any) {
        const msg = err.name === 'TimeoutError' ? 'timeout' : err.message;
        console.warn(`[Relay] ERROR ${publisherUrl} | ${msg}`);
        errors.push(`${publisherUrl}: ${msg}`);
        continue; 
      }
    }

    // All providers failed
    const summary = errors.slice(-3).join(' | ');
    console.error('[Relay] All publishers failed:', errors);
    return NextResponse.json(
      { error: `All Walrus publishers failed. Last errors: ${summary}` },
      { status: 502 }
    );

  } catch (error: any) {
    console.error('[Relay] Internal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
