import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.mystenlabs.com',
  'https://publisher.walrus.space',
  'https://walrus-mainnet-publisher.staketab.org',
  'https://walrus-mainnet-publisher-1.staketab.org',
  'https://walrus-mainnet-publisher.chainode.tech',
  'https://publisher.walrus-mainnet.nodeinfra.com',
  'https://publisher.walrus-mainnet.decentnode.com',
  'https://publisher.walrus-mainnet.blockscope.net',
  'https://walrus-publisher-mainnet.nodeist.net'
];

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = searchParams.get('epochs') || '1';
    const sendObjectTo = searchParams.get('send_object_to');

    // Buffer the request into memory to allow retries across different providers
    const buffer = await req.arrayBuffer();
    
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const MAX_SIZE = 4.5 * 1024 * 1024;
    if (buffer.byteLength > MAX_SIZE) { 
      return NextResponse.json({ error: `File too large for backend relay (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB). Limit is 4.5MB.` }, { status: 413 });
    }

    let lastError = '';

    // Provider Rotation Loop
    for (const publisherUrl of PUBLISHER_POOL) {
      // Build URL - only add epochs if > 1 or specific parameters are needed
      let url = `${publisherUrl}/v1/blobs`;
      const queryParams = new URLSearchParams();
      if (epochs && epochs !== '1') queryParams.append('epochs', epochs);
      if (sendObjectTo) queryParams.append('send_object_to', sendObjectTo);
      
      const queryString = queryParams.toString();
      if (queryString) url += `?${queryString}`;

      console.log(`[Backend Relay] [TRY] ${publisherUrl} | Size: ${buffer.byteLength}`);

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'User-Agent': 'Mozilla/5.0 (WalForm Relay)',
          },
          // Using Uint8Array is often more compatible than raw ArrayBuffer in fetch
          body: new Uint8Array(buffer),
          signal: AbortSignal.timeout(25000) 
        });

        if (!res.ok) {
          const status = res.status;
          let text = '';
          try {
            text = await res.text();
          } catch {
            text = res.statusText;
          }
          
          console.warn(`[Backend Relay] [FAIL] ${publisherUrl} | Status: ${status} | Error: ${text.substring(0, 50)}`);
          lastError = `${publisherUrl}: ${status} ${text.substring(0, 50)}`;
          continue; 
        }

        const data = await res.json();
        console.log(`[Backend Relay] [SUCCESS] ${publisherUrl}`);
        return NextResponse.json(data);

      } catch (err: any) {
        console.warn(`[Backend Relay] [ERROR] ${publisherUrl} | ${err.message}`);
        lastError = `${publisherUrl}: ${err.message}`;
        continue; 
      }
    }

    // If we reach here, all providers failed
    console.error('[Backend Relay] All providers failed. Last error:', lastError);
    return NextResponse.json({ error: `All Walrus publishers failed. Last error: ${lastError}` }, { status: 502 });

  } catch (error: any) {
    console.error('[Backend Relay] Internal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
