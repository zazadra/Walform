import { NextRequest, NextResponse } from 'next/server';

// Walrus Mainnet Publisher Pool (Sorted by presumed reliability)
const PUBLISHER_POOL = [
  'https://walrus-mainnet-publisher-1.staketab.org:443',
  'https://publisher.walrus-mainnet.mystenlabs.com',
  'https://walrus-publisher-mainnet.mystenlabs.com',
  'https://publisher.mainnet.walrus.space',
  'https://publisher.walrus-mainnet.nodeinfra.com',
  'https://publisher.walrus-mainnet.decentnode.com',
  'https://publisher.walrus-mainnet.blockscope.net',
  'https://walrus-mainnet-publisher.chainode.tech'
];

const MAX_RETRIES = 2; // Total attempts per publisher
const INITIAL_BACKOFF_MS = 500;

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = searchParams.get('epochs') || '1';
    const sendObjectTo = searchParams.get('send_object_to');

    // Read the raw body bytes from the incoming request
    const buffer = await req.arrayBuffer();
    
    let lastError: string | null = null;
    let lastStatus = 500;

    // Cycle through all known publishers in the pool
    for (const publisherUrl of PUBLISHER_POOL) {
      let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
      if (sendObjectTo) {
        url += `&send_object_to=${sendObjectTo}`;
      }

      console.log(`[Walrus Proxy] Attempting upload to: ${publisherUrl}`);

      // Retry loop for the current publisher
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Node.js fetch bypasses browser CORS!
          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: buffer,
            // Timeout to prevent hanging if node is completely unresponsive
            signal: AbortSignal.timeout(30000) 
          });

          if (!res.ok) {
            let errorText = await res.text();
            lastStatus = res.status;
            
            // Handle Cloudflare HTML errors gracefully (e.g., Staketab 502 Bad Gateway)
            if (res.status >= 500 && errorText.includes('<!DOCTYPE html>')) {
              errorText = `The storage node (${new URL(publisherUrl).hostname}) returned a Bad Gateway HTML response.`;
            }
            
            lastError = errorText;
            console.warn(`[Walrus Proxy] [${publisherUrl}] Attempt ${attempt} failed: ${res.status} - ${errorText.substring(0, 100)}`);
            
            // If it's a 4xx error (except 429), it's a bad request, not a node failure, so we shouldn't retry
            if (res.status >= 400 && res.status < 500 && res.status !== 429) {
              return NextResponse.json({ error: errorText }, { status: res.status });
            }
            
            // Apply exponential backoff before retrying
            if (attempt < MAX_RETRIES) {
              const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
              await new Promise(r => setTimeout(r, backoff));
            }
            continue; // Next attempt
          }

          // SUCCESS!
          const data = await res.json();
          console.log(`[Walrus Proxy] Upload SUCCESS using ${publisherUrl}`);
          return NextResponse.json(data);

        } catch (error: any) {
          lastStatus = 502;
          lastError = error.message;
          console.warn(`[Walrus Proxy] [${publisherUrl}] Attempt ${attempt} network error: ${error.message}`);
          
          if (attempt < MAX_RETRIES) {
            const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, backoff));
          }
        }
      }
      // If we exit the inner loop, all retries for THIS publisher failed.
      console.log(`[Walrus Proxy] Publisher ${publisherUrl} exhausted all retries. Failing over to next publisher...`);
    }

    // If we exit the outer loop, ALL publishers have failed.
    console.error('[Walrus Proxy] ALL PUBLISHERS FAILED. Last Error:', lastError);
    return NextResponse.json({ 
      error: `All Walrus Mainnet storage nodes are currently offline or unreachable. Last error: ${lastError}` 
    }, { status: lastStatus });

  } catch (error: any) {
    console.error('[Walrus Proxy] Internal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
