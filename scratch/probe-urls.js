const https = require('https');

const urls = [
  'https://upload-relay.mainnet.walrus.space',
  'https://upload-relay.mainnet.walrus.space/v1/blobs',
  'https://publisher.walrus-mainnet.walrus.space/v1/blobs',
  'https://publisher.mainnet.walrus.space/v1/blobs'
];

async function probe(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET' }, (res) => {
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.statusCode}`);
      resolve();
    });
    req.on('error', (e) => {
      console.log(`URL: ${url}`);
      console.log(`Error: ${e.message}`);
      resolve();
    });
    req.end();
  });
}

async function run() {
  for (const url of urls) {
    await probe(url);
    console.log('---');
  }
}

run();
