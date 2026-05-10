import { NextRequest, NextResponse } from 'next/server';

// Node.js runtime — no 30s edge limit, supports longer Walrus publisher timeouts
export const runtime = 'nodejs';
export const maxDuration = 60;

// Only include publishers that reliably handle server-to-server requests
// (no Cloudflare blocks, no strict CORS restrictions on PUT)
const PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.mystenlabs.com', 
  'https://publisher.walrus.space',                  
  'https://walrus-mainnet-publisher.staketab.org',   
  'https://publisher.walrus-mainnet.nodeinfra.com',  
  'https://walrus-mainnet-publisher.nodes.guru',
  'https://walrus-mainnet-publisher.polkachu.com',
];

const TIMEOUT_MS = 25_000; // 25s per attempt (leaves buffer for relay overhead)

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = Math.max(1, parseInt(searchParams.get('epochs') || '5', 10));
    const sendObjectTo = searchParams.get('send_object_to');

    const buffer = await req.arrayBuffer();

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const MAX_SIZE = 9 * 1024 * 1024; // 9MB
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB). Max 9MB.` },
        { status: 413 },
      );
    }

    const errors: string[] = [];

    for (const publisherUrl of PUBLISHER_POOL) {
      // Correct Walrus REST API: PUT /v1/blobs?epochs=N
      // NOTE: Do NOT pass deletable=true — it's the default AND causes internal errors on some publishers
      let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
      if (sendObjectTo) url += `&send_object_to=${sendObjectTo}`;

      console.log(`[Relay] → ${publisherUrl} | ${buffer.byteLength} bytes | ${epochs} epochs`);

      try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/octet-stream',
            'User-Agent': 'Walform-Relay/1.0',
          },
          body: buffer,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          // Try to parse error as text (some publishers return HTML)
          let errText = '';
          try {
            const raw = await res.text();
            // Strip HTML tags if it's an HTML error page
            errText = raw.replace(/<[^>]*>/g, '').trim().substring(0, 100);
          } catch { errText = res.statusText; }

          console.warn(`[Relay] FAIL ${publisherUrl} | ${res.status} | ${errText}`);
          errors.push(`${publisherUrl}: ${res.status}`);
          continue;
        }

        const data = await res.json();
        console.log(`[Relay] SUCCESS ${publisherUrl}`);
        return NextResponse.json(data);

      } catch (err: any) {
        const msg = err.name === 'TimeoutError' ? 'timeout (25s)' : err.message;
        console.warn(`[Relay] ERROR ${publisherUrl} | ${msg}`);
        errors.push(`${publisherUrl}: ${msg}`);
        continue;
      }
    }

    // All failed
    const summary = errors.join(' | ');
    console.error('[Relay] All publishers failed:', summary);
    return NextResponse.json(
      { error: `All Walrus publishers failed. Errors: ${summary}` },
      { status: 502 },
    );

  } catch (error: any) {
    console.error('[Relay] Internal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
