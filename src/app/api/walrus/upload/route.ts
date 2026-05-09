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
      let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
      if (sendObjectTo) {
        url += `&send_object_to=${sendObjectTo}`;
      }

      console.log(`[Backend Relay] Attempting upload to: ${publisherUrl} (Size: ${buffer.byteLength} bytes)`);

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': buffer.byteLength.toString(),
            'User-Agent': 'WalForm-Relay/1.0',
            'Accept': 'application/json',
          },
          body: buffer,
          // Use a shorter timeout per node to cycle faster if one is slow
          signal: AbortSignal.timeout(20000) 
        });

        if (!res.ok) {
          let errorText = '';
          try {
            errorText = await res.text();
          } catch {
            errorText = `HTTP ${res.status}`;
          }
          
          // Handle common node errors
          if (res.status === 502 || res.status === 504 || res.status === 503) {
            errorText = `Node Busy/Offline (${res.status})`;
          } else if (res.status === 413) {
            errorText = `Node rejected size (${res.status})`;
          }
          
          console.warn(`[Backend Relay] [${publisherUrl}] failed: ${res.status} - ${errorText.substring(0, 100)}`);
          lastError = `${publisherUrl}: ${res.status} ${errorText.substring(0, 50)}`;
          continue; 
        }

        const data = await res.json();
        console.log(`[Backend Relay] SUCCESS on ${publisherUrl}`);
        return NextResponse.json(data);

      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('aborted');
        console.warn(`[Backend Relay] [${publisherUrl}] ${isTimeout ? 'Timeout' : 'Network'} Error: ${err.message}`);
        lastError = `${publisherUrl}: ${isTimeout ? 'Timeout' : err.message}`;
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
