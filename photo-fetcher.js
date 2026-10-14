const fs = require('node:fs');

function validateShareUrl(value) {
  if (typeof value !== 'string') throw new Error('Amazon Photosの共有URLを確認してください。');
  const url = new URL(value);
  if (url.origin !== 'https://www.amazon.co.jp' || !url.pathname.startsWith('/photos/share/') || !url.pathname.slice('/photos/share/'.length) || url.username || url.password) {
    throw new Error('Amazon Photosの共有URLを確認してください。');
  }
  return url.href;
}

// One active browser per Node process. Identical requests share the same job.
function createPhotoFetcher(chromium, options = {}) {
  const maxPending = options.maxPending ?? 6;
  const timeoutMs = options.timeoutMs ?? 270000;
  const initialWaitMs = options.initialWaitMs ?? 7000;
  const scrollWaitMs = options.scrollWaitMs ?? 1000;
  const pending = new Map();
  let tail = Promise.resolve();
  let cleanupFailed = false;

  async function collect(url) {
    if (cleanupFailed) throw new Error("ブラウザーの終了を確認できません。管理者による確認が必要です。");
    let browser;
    let timer;
    try {
      const diagnostics = {};
      for (const name of ['pids.current', 'pids.max', 'pids.events', 'memory.current', 'memory.max', 'memory.events']) {
        try { diagnostics[name] = fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim(); } catch {}
      }
      console.log('Chromium resource check:', diagnostics);
      browser = await chromium.launch({
        headless: true,
        timeout: 30000,
        ...(options.executablePath ? { executablePath: options.executablePath } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const scrape = async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const images = new Set();
        page.on('response', async response => {
          try {
            const imageUrl = response.url();
            const headers = await response.allHeaders();
            if ((headers['content-type'] || '').startsWith('image/') &&
                (new URL(imageUrl).hostname === 'thumbnails-photos.amazon.co.jp' || imageUrl.includes('/thumbnail/'))) images.add(imageUrl);
          } catch {}
        });
        // Keep images and scripts enabled: thumbnail discovery needs their responses.
        await page.route('**/*', route => ['media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
        await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
        await page.waitForTimeout(initialWaitMs);
        let lastCount = images.size;
        let stableCount = 0;
        for (let i = 0; i < 200; i++) {
          await page.mouse.wheel(0, 2000);
          await page.waitForTimeout(scrollWaitMs);
          if (images.size === lastCount) stableCount++;
          else { stableCount = 0; lastCount = images.size; }
          if (stableCount >= 5) break;
        }
        if (!images.size) throw new Error('写真を取得できませんでした。既存の登録情報は保持されています。');
        return { title: await page.title(), images: [...images] };
      };
      return await Promise.race([
        scrape(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('写真取得がタイムアウトしました。時間をおいて再度お試しください。')), timeoutMs); })
      ]);
    } finally {
      clearTimeout(timer);
      // Do not release the queue until the browser has finished closing.
      if (browser) {
        try { await browser.close(); }
        catch (error) { cleanupFailed = true; throw error; }
      }
    }
  }

  return function getPhotos(value) {
    let url;
    try { url = validateShareUrl(value); } catch (error) { return Promise.reject(error); }
    if (pending.has(url)) return pending.get(url);
    if (pending.size >= maxPending) return Promise.reject(new Error('写真の読み込みが混み合っています。時間をおいて再度お試しください。'));
    const job = tail.then(() => collect(url));
    const result = job.finally(() => pending.delete(url));
    pending.set(url, result);
    tail = result.catch(() => {});
    return result;
  };
}

module.exports = { createPhotoFetcher, validateShareUrl };
