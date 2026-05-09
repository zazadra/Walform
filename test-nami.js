const https = require('https');
fetch('https://docs.nami.cloud/api-reference/walrus/introduction')
  .then(async r => {
    const txt = await r.text();
    const urls = txt.match(/https:\/\/[^"'\s<>]+/g);
    if (urls) {
      console.log(Array.from(new Set(urls.filter(u => u.includes('nami.cloud') || u.includes('walrus')))).join('\n'));
    }
  });
