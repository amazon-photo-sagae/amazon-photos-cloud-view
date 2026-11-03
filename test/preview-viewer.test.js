const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPreviewViewer, sampleGalleryHtml } = require('../scripts/preview-viewer');

test('the actual gallery never refreshes expired preview data or writes storage, even after the real clock advances', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-clock-'));
  const album = 'https://www.amazon.co.jp/photos/share/test-album';
  const file = path.join(directory, 'gallery-cache.json');
  const data = JSON.stringify({ [album]: { time: 1, images: ['https://thumbnails-photos.amazon.co.jp/v1/thumbnail/photo?cdsShareId=test-album'] } });
  fs.writeFileSync(file, data);
  const originalNow = Date.now;
  let server;
  try {
    const loaded = loadPreviewViewer(directory);
    const { app, audit } = loaded;
    Date.now = () => originalNow() + 7 * 24 * 3600000;
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/gallery?url=${encodeURIComponent(album)}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /savePhotoLink/);
    assert.equal(audit.fetchAttempts, 0);
    assert.equal(audit.writeAttempts, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), data);
    assert.ok(audit.readPaths.every(file => path.dirname(file) === directory));
  } finally {
    Date.now = originalNow;
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('offline image substitution fails closed if the real viewer markup changes', () => {
  assert.throws(() => sampleGalleryHtml('<html><img src="https://example.com"></html>', 1), /markup changed/);
});
