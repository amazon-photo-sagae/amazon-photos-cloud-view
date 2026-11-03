const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { loadPreviewViewer } = require('../scripts/preview-viewer');

test('portrait, landscape and square photos stay fully above the save panel across phone and desktop sizes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-layout-'));
  const album = 'https://www.amazon.co.jp/photos/share/layout-album';
  const shapes = [
    { id: 'portrait', width: 600, height: 1800 },
    { id: 'landscape', width: 1800, height: 600 },
    { id: 'square', width: 900, height: 900 },
    { id: 'fallback', width: 600, height: 1800 }
  ];
  const images = shapes.map(shape => `https://thumbnails-photos.amazon.co.jp/v1/thumbnail/${shape.id}?viewBox=477${shape.id === 'fallback' ? '' : '&cdsShareId=layout-album'}`);
  const file = path.join(directory, 'gallery-cache.json');
  const initial = JSON.stringify({ [album]: { time: Date.now(), images } });
  fs.writeFileSync(file, initial);
  const loaded = loadPreviewViewer(directory);
  const server = loaded.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    const page = await browser.newPage();
    await page.route('https://**/*', route => {
      const id = new URL(route.request().url()).pathname.split('/').pop();
      const shape = shapes.find(value => value.id === id);
      if (!shape || route.request().resourceType() !== 'image') return route.abort();
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${shape.width}" height="${shape.height}"><rect width="100%" height="100%" fill="blue"/><rect y="${shape.height - 30}" width="100%" height="30" fill="red"/></svg>` });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/gallery?url=${encodeURIComponent(album)}`);
    const viewports = [
      { width: 390, height: 844 }, { width: 844, height: 390 },
      { width: 375, height: 667 }, { width: 667, height: 375 },
      { width: 320, height: 568 }, { width: 568, height: 320 },
      { width: 1280, height: 720 }, { width: 1920, height: 1080 }
    ];
    let checks = 0;
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      // Extra bottom inset and larger instructions model safe-area and wrapping;
      // this is not a substitute for testing real Safari browser chrome.
      for (const extraSpace of [false, true]) {
        await page.locator('#savePhotoPanel').evaluate((panel, extra) => {
          panel.style.paddingBottom = extra ? '46px' : '';
          panel.querySelector('p').style.fontSize = extra ? '20px' : '';
        }, extraSpace);
        for (let index = 0; index < shapes.length; index++) {
          await page.locator('.photo').nth(index).click();
          await page.locator('#viewerImage').evaluate(image => image.decode());
          const boxes = await page.evaluate(() => {
            const rect = selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
            };
            return { image: rect('#viewerImage'), stage: rect('#photoStage'), panel: rect('#savePhotoPanel'), link: rect('#savePhotoLink'), previous: rect('#prev'), next: rect('#next') };
          });
          const label = JSON.stringify({ viewport, extraSpace, shape: shapes[index].id });
          assert.ok(boxes.image.width > 0 && boxes.image.height > 0, label);
          assert.ok(boxes.image.top >= boxes.stage.top - 0.5 && boxes.image.bottom <= boxes.stage.bottom + 0.5, label);
          assert.ok(boxes.image.bottom <= boxes.panel.top + 0.5, label);
          assert.ok(boxes.image.left >= -0.5 && boxes.image.right <= viewport.width + 0.5, label);
          assert.ok(Math.abs(boxes.image.width / boxes.image.height - shapes[index].width / shapes[index].height) < 0.001, label);
          assert.ok(boxes.panel.bottom <= viewport.height + 0.5, label);
          for (const control of [boxes.link, boxes.previous, boxes.next]) {
            assert.ok(control.top >= 0 && control.bottom <= viewport.height + 0.5 && control.left >= 0 && control.right <= viewport.width + 0.5, label);
          }
          const href = index === 3 ? album : `${album}/gallery/${shapes[index].id}?pageIndex=0`;
          assert.equal(await page.locator('#savePhotoLink').getAttribute('href'), href);
          await page.locator('#close').click();
          checks++;
        }
      }
    }
    assert.equal(checks, 64);
    assert.equal(loaded.audit.fetchAttempts, 0);
    assert.equal(loaded.audit.writeAttempts, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), initial);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
