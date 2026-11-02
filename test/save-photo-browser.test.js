const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

test('viewer updates individual/fallback links, opens a new tab, and preserves navigation without scraping or storage writes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'save-photo-browser-'));
  const share = '0ib8h7jiztQ0T6eiAoEvjWTejt68Iw422qxy6mW2ptJ';
  const album = `https://www.amazon.co.jp/photos/share/${share}`;
  const ids = ['jDUzjFfbT4uLCNvrIDakDg', 'Da9IPAhUTN6HLdl7XdyFeA'];
  // The second URL is user-verified. The first is a synthetic navigation fixture.
  const images = ids.map(id => `https://thumbnails-photos.amazon.co.jp/v1/thumbnail/${id}?viewBox=477&ownerId=A2AAWBN8WHDN3&cdsShareId=${share}`);
  images.push(images[0].replace(`cdsShareId=${share}`, 'cdsShareId=other-album'));
  const cacheFile = path.join(directory, 'gallery-cache.json');
  const invalidAlbum = `${album}/gallery/${ids[0]}`;
  const initial = JSON.stringify({
    [album]: { time: Date.now(), images },
    [invalidAlbum]: { time: Date.now(), images }
  });
  fs.writeFileSync(cacheFile, initial);
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  const { app } = require('../server');
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  const originalLaunch = chromium.launch;
  let scrapeLaunches = 0;
  try {
    browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    chromium.launch = async () => { scrapeLaunches++; throw Error('Unexpected scraper launch'); };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    // No Amazon requests leave the test. Images and destination pages are fixtures.
    await context.route('https://**/*', route => route.request().resourceType() === 'image'
      ? route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64') })
      : route.fulfill({ contentType: 'text/html', body: '<title>Offline destination fixture</title>' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/gallery?url=${encodeURIComponent(album)}`);
    await page.locator('.photo').first().click();
    const link = page.locator('#savePhotoLink');
    assert.equal(await link.getAttribute('href'), `${album}/gallery/${ids[0]}?pageIndex=0`);
    await page.locator('#next').click();
    assert.equal(await link.textContent(), '元画質で保存（Amazon Photosへ）');
    assert.equal(await link.getAttribute('href'), `${album}/gallery/${ids[1]}?pageIndex=0`);
    assert.equal(await page.locator('#viewerImage').getAttribute('src'), images[1]);
    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), `${album}/gallery/${ids[1]}?pageIndex=0`);
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();
    await page.locator('#next').click();
    assert.equal(await link.getAttribute('href'), album);
    assert.equal(await link.textContent(), 'Amazon Photosで共有アルバムを開く');
    assert.match(await page.locator('#savePhotoHint').textContent(), /同じ写真を選び/);
    await page.locator('#next').click();
    assert.equal(await link.getAttribute('href'), `${album}/gallery/${ids[0]}?pageIndex=0`);
    await page.locator('#prev').click();
    assert.equal(await link.getAttribute('href'), album);
    await page.locator('#close').click();
    assert.equal(await page.locator('#viewer').isVisible(), false);
    await page.locator('.photo').nth(1).click();
    await page.locator('#viewer').dispatchEvent('touchstart', { changedTouches: [{ identifier: 1, screenX: 200 }] });
    await page.locator('#viewer').dispatchEvent('touchend', { changedTouches: [{ identifier: 1, screenX: 100 }] });
    assert.equal(await link.getAttribute('href'), album);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      const box = await link.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/gallery?url=${encodeURIComponent(invalidAlbum)}`);
    await page.locator('.photo').first().click();
    assert.equal(await link.isVisible(), false);
    assert.equal(await link.getAttribute('href'), null);
    assert.match(await page.locator('#savePhotoHint').textContent(), /保存先を開けません/);
    assert.deepEqual(errors, []);
    assert.equal(scrapeLaunches, 0);
    assert.equal(fs.readFileSync(cacheFile, 'utf8'), initial);
    assert.deepEqual(fs.readdirSync(directory), ['gallery-cache.json']);
  } finally {
    chromium.launch = originalLaunch;
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
