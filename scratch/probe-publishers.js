const https = require('https');

const publishers = [
  'https://upload-relay.mainnet.walrus.space/v1/blobs',
  'https://walrus-mainnet-publisher-1.staketab.org/v1/blobs',
  'https://walrus-mainnet-publisher.nami.cloud/v1/blobs' // Checking Nami as well
];

async function probe(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'PUT' }, (res) => {
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.statusCode}`);
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        console.log(`Body: ${body.slice(0, 100)}`);
        resolve();
      });
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
  for (const url of publishers) {
    await probe(url);
    console.log('---');
  }
}

run();
