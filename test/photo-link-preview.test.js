const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { createPreview } = require('../scripts/photo-link-preview');

test('stage-two form and actual viewer handle multiple albums, positions, sizes, results and safe fallbacks without scraping', async () => {
  const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const previousDataDir = process.env.DATA_DIR;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.DATA_DIR = '/must-not-be-used-by-preview';
  process.env.ADMIN_PASSWORD = 'preview-must-ignore-this';
  const preview = createPreview();
  assert.equal(process.env.DATA_DIR, '/must-not-be-used-by-preview');
  assert.equal(process.env.ADMIN_PASSWORD, 'preview-must-ignore-this');
  const blockedLaunch = chromium.launch;
  let scrapeAttempts = 0;
  chromium.launch = async (...args) => { scrapeAttempts++; return blockedLaunch(...args); };
  const server = preview.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = await browser.newContext();
    let externalRequests = 0;
    await context.route('https://**/*', route => {
      externalRequests++;
      return route.request().resourceType() === 'image'
        ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="blue"/></svg>' })
        : route.fulfill({ contentType: 'text/html', body: '<title>Offline Amazon fixture</title>' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    assert.match(await page.title(), /第2段階/);
    const csrf = await page.locator('input[name=csrf]').first().inputValue();
    const file = path.join(preview.directory, 'gallery-cache.json');
    const seed = fs.readFileSync(file, 'utf8');

    // No public or admin route, foreign Host, cross-origin mutation or uncached
    // album may escape into the existing application's scrape/storage routes.
    for (const route of ['/admin', '/admin/update', '/test', '/gallery?url=https://www.amazon.co.jp/photos/share/not-added']) {
      assert.equal((await fetch(base + route)).status, 404);
    }
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(base, { headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await fetch(base + '/photos', { method: 'POST', body: new URLSearchParams({ csrf }), headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base + '/photos', { method: 'POST', body: new URLSearchParams({}) })).status, 403);
    for (const invalid of [
      { album: 'https://evil.example/photos/share/test' },
      { thumbnail: 'https://thumbnails-photos.amazon.co.jp.evil.example/a' },
      { thumbnail: 'https://thumbnails-photos.amazon.co.jp/a" onerror="alert(1)' },
      { expected: 'https://www.amazon.co.jp/photos/share/other/gallery/photo?pageIndex=0' }
    ]) {
      const response = await fetch(base + '/photos', {
        method: 'POST', body: new URLSearchParams({ csrf, album: 'https://www.amazon.co.jp/photos/share/test-album', thumbnail: 'https://thumbnails-photos.amazon.co.jp/v1/thumbnail/photo?cdsShareId=test-album', expected: '', position: 'first', ...invalid })
      });
      assert.equal(response.status, 400);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), seed);

    for (const albumId of ['synthetic-album-A', 'synthetic-album-B']) {
      for (const position of ['first', 'middle', 'last']) {
        const album = `https://www.amazon.co.jp/photos/share/${albumId}`;
        await page.selectOption('select[name=position]', position);
        await page.fill('input[name=album]', album);
        await page.fill('input[name=thumbnail]', `https://thumbnails-photos.amazon.co.jp/v1/thumbnail/${position}?viewBox=477&cdsShareId=${albumId}`);
        await page.fill('input[name=expected]', `${album}/gallery/${position}?pageIndex=0`);
        await page.getByRole('button', { name: 'テストに追加' }).click();
        assert.equal(page.url(), base + '/', await page.locator('body').textContent());
        await page.waitForURL(base + '/');
      }
    }
    assert.equal(await page.locator('.viewer-link').count(), 3);
    assert.equal(await page.locator('tbody tr').count(), 16); // 4 seeds + 6 photos at 2 sizes
    const tableText = await page.locator('tbody').textContent();
    assert.match(tableText, /先頭/);
    assert.match(tableText, /中間/);
    assert.match(tableText, /最後/);
    assert.equal((tableText.match(/URL一致/g) || []).length, 14);

    // Actual emitted viewer: first/middle/last plus size variants in each album.
    for (const albumId of ['synthetic-album-A', 'synthetic-album-B']) {
      const album = `https://www.amazon.co.jp/photos/share/${albumId}`;
      const beforeViewing = fs.readFileSync(file, 'utf8');
      await page.goto(`${base}/gallery?url=${encodeURIComponent(album)}&refresh=1`);
      assert.equal(await page.locator('.photo').count(), 6);
      await page.locator('.photo').first().click();
      for (const position of ['first', 'middle', 'last']) {
        for (let size = 0; size < 2; size++) {
          const link = page.locator('#savePhotoLink');
          assert.equal(await link.getAttribute('href'), `${album}/gallery/${position}?pageIndex=0`);
          if (position === 'last' && size === 1) {
            const popupPromise = page.waitForEvent('popup');
            await link.click();
            const popup = await popupPromise;
            await popup.waitForLoadState();
            assert.equal(popup.url(), `${album}/gallery/last?pageIndex=0`);
            await popup.close();
          }
          await page.locator('#next').click();
        }
      }
      assert.equal(await page.locator('#savePhotoLink').getAttribute('href'), `${album}/gallery/first?pageIndex=0`);
      await page.locator('#prev').click();
      assert.equal(await page.locator('#savePhotoLink').getAttribute('href'), `${album}/gallery/last?pageIndex=0`);
      assert.equal(fs.readFileSync(file, 'utf8'), beforeViewing);
    }

    const seedAlbum = 'https://www.amazon.co.jp/photos/share/0ib8h7jiztQ0T6eiAoEvjWTejt68Iw422qxy6mW2ptJ';
    for (const index of [2, 3]) {
      await page.goto(`${base}/gallery?url=${encodeURIComponent(seedAlbum)}`);
      await page.locator('.photo').nth(index).click();
      assert.equal(await page.locator('#savePhotoLink').getAttribute('href'), seedAlbum);
      assert.equal(await page.locator('#savePhotoLink').textContent(), 'Amazon Photosで共有アルバムを開く');
    }
    await page.goto(base);
    const firstResult = page.locator('form[action="/results"]').first();
    await firstResult.locator('select').selectOption({ label: '同じ写真が開いた' });
    await firstResult.getByRole('button', { name: '記録' }).click();
    await page.waitForURL(base + '/');
    assert.equal(await page.locator('form[action="/results"] select').first().inputValue(), '同じ写真が開いた');

    // UI state differences are accepted and distinguished from photo identity.
    await page.fill('input[name=album]', 'https://www.amazon.co.jp/photos/share/synthetic-album-A');
    await page.fill('input[name=thumbnail]', 'https://thumbnails-photos.amazon.co.jp/v1/thumbnail/late?cdsShareId=synthetic-album-A');
    await page.fill('input[name=expected]', 'https://www.amazon.co.jp/photos/share/synthetic-album-A/gallery/late?pageIndex=3');
    await page.uncheck('input[name=variant]');
    await page.getByRole('button', { name: 'テストに追加' }).click();
    await page.waitForURL(base + '/');
    assert.match(await page.locator('tbody tr').last().textContent(), /写真ID一致・URLの補助情報/);
    for (const suffix of ['', '?other=1&pageIndex=0', '?pageIndex=0&other=1', '/?pageIndex=0']) {
      const response = await fetch(base + '/photos', {
        method: 'POST', redirect: 'manual', body: new URLSearchParams({
          csrf, album: 'https://www.amazon.co.jp/photos/share/synthetic-album-A',
          thumbnail: 'https://thumbnails-photos.amazon.co.jp/v1/thumbnail/late?cdsShareId=synthetic-album-A',
          expected: `https://www.amazon.co.jp/photos/share/synthetic-album-A/gallery/late${suffix}`, position: 'last'
        })
      });
      assert.equal(response.status, 303, suffix);
    }
    const differentPhoto = await fetch(base + '/photos', {
      method: 'POST', redirect: 'manual', body: new URLSearchParams({
        csrf, album: 'https://www.amazon.co.jp/photos/share/synthetic-album-A',
        thumbnail: 'https://thumbnails-photos.amazon.co.jp/v1/thumbnail/late?cdsShareId=synthetic-album-A',
        expected: 'https://www.amazon.co.jp/photos/share/synthetic-album-A/gallery/different-photo?extra=1', position: 'last'
      })
    });
    assert.equal(differentPhoto.status, 303);
    await page.goto(base);
    assert.match(await page.locator('tbody tr').last().textContent(), /写真ID不一致/);
    assert.deepEqual(errors, []);
    assert.ok(externalRequests > 0); // All intercepted; no real Amazon traffic.
    assert.equal(scrapeAttempts, 0);
    assert.deepEqual(fs.readdirSync(preview.directory), ['gallery-cache.json']);
  } finally {
    chromium.launch = blockedLaunch;
    preview.cleanup();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    assert.equal(fs.existsSync(preview.directory), false);
  }
});
