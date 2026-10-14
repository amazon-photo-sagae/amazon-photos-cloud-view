const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { createPhotoFetcher } = require('../photo-fetcher');

test('real Chromium discovers thumbnail responses and releases browser after queued jobs', async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/thumbnail/')) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64'));
    } else { res.end('<html><head><title>Fixture album</title></head><body><img src="/thumbnail/image.png"></body></html>'); }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let active = 0; let maximum = 0;
  // Map navigation to an isolated local fixture; no Amazon or production data used.
  const adapter = { async launch(options) {
    const browser = await chromium.launch(options);
    active++; maximum = Math.max(maximum, active);
    const newPage = browser.newPage.bind(browser);
    const close = browser.close.bind(browser);
    browser.newPage = async options => {
      const page = await newPage(options); const goto = page.goto.bind(page);
      page.goto = (_, options) => goto(`http://127.0.0.1:${server.address().port}/`, options);
      return page;
    };
    browser.close = async () => { await close(); active--; };
    return browser;
  } };
  const getPhotos = createPhotoFetcher(adapter, {
    executablePath: process.env.TEST_CHROMIUM_PATH || '/usr/bin/chromium', initialWaitMs: 100, scrollWaitMs: 20
  });
  try {
    const results = await Promise.all(['one', 'two'].map(name => getPhotos(`https://www.amazon.co.jp/photos/share/${name}`)));
    for (const result of results) {
      assert.equal(result.title, 'Fixture album'); assert.equal(result.images.length, 1);
      assert.match(result.images[0], /\/thumbnail\/image.png/);
    }
    assert.equal(maximum, 1); assert.equal(active, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
