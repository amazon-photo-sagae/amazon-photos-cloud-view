const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createPhotoFetcher } = require('../photo-fetcher');
const url = name => `https://www.amazon.co.jp/photos/share/${name}`;
const image = 'https://thumbnails-photos.amazon.co.jp/thumbnail/photo.jpg';
function fakeChromium(options = {}) {
  const stats = { launches: 0, active: 0, maximum: 0, closed: 0 };
  return { stats, async launch() {
    stats.launches++;
    if (options.failLaunch?.(stats.launches)) throw new Error('spawn EAGAIN');
    stats.active++; stats.maximum = Math.max(stats.maximum, stats.active);
    let response;
    return {
      async newPage() { return {
        on(event, handler) { response = handler; }, async route() {},
        async goto() {
          if (options.hang) return new Promise(() => {});
          if (!options.empty) await response({ url: () => image, allHeaders: async () => ({ 'content-type': 'image/jpeg' }) });
        },
        async waitForTimeout() { await new Promise(resolve => setTimeout(resolve, 1)); },
        mouse: { async wheel() {} }, async title() { return 'Album'; }
      }; },
      async close() { stats.active--; stats.closed++; }
    };
  } };
}
const fast = { initialWaitMs: 1, scrollWaitMs: 1 };
test('different albums are serialized and same-album requests share one job', async () => {
  const chromium = fakeChromium(); const fetch = createPhotoFetcher(chromium, fast);
  const first = fetch(url('one')); assert.equal(first, fetch(url('one')));
  const results = await Promise.all([first, fetch(url('two')), fetch(url('three'))]);
  assert.equal(chromium.stats.launches, 3); assert.equal(chromium.stats.maximum, 1);
  assert.equal(chromium.stats.active, 0); assert.equal(results[0].images.length, 1);
});
test('EAGAIN does not deadlock queue; subsequent request can succeed', async () => {
  const chromium = fakeChromium({ failLaunch: count => count === 1 });
  const fetch = createPhotoFetcher(chromium, fast);
  const failure = assert.rejects(fetch(url('one')), /EAGAIN/);
  const second = fetch(url('two')); await failure; assert.equal((await second).images.length, 1);
  assert.equal(chromium.stats.active, 0);
});
test('queue capacity and URL validation prevent extra browser launches', async () => {
  const chromium = fakeChromium(); const fetch = createPhotoFetcher(chromium, { ...fast, maxPending: 1 });
  const first = fetch(url('one'));
  await assert.rejects(fetch(url('two')), /混み合/);
  await assert.rejects(fetch('https://example.com/'), /共有URL/);
  await first; assert.equal(chromium.stats.launches, 1);
});
test('timeout closes browser and empty image results fail safely', async () => {
  const chromium = fakeChromium({ hang: true });
  await assert.rejects(createPhotoFetcher(chromium, { ...fast, timeoutMs: 15 })(url('one')), /タイムアウト/);
  assert.equal(chromium.stats.active, 0);
  const empty = fakeChromium({ empty: true });
  await assert.rejects(createPhotoFetcher(empty, fast)(url('two')), /写真を取得できません/);
  assert.equal(empty.stats.active, 0);
});

async function withApp(fetcher, run, corrupt = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-regression-'));
  const existing = [{ name: '既存試合', url: url('existing') }];
  const cache = { [url('existing')]: { time: Date.now() - 13 * 3600000, images: [image] } };
  fs.writeFileSync(path.join(directory, 'galleries.json'), corrupt ? '{broken' : JSON.stringify(existing));
  fs.writeFileSync(path.join(directory, 'gallery-cache.json'), JSON.stringify(cache));
  fs.writeFileSync(path.join(directory, 'current-gallery.txt'), url('existing'));
  const moduleObject = { exports: {} };
  const context = {
    require(name) {
      if (name === 'playwright') return { chromium: {} };
      if (name === './photo-fetcher') return { createPhotoFetcher: () => fetcher, validateShareUrl: require('../photo-fetcher').validateShareUrl };
      return require(name);
    }, module: moduleObject,
    process: { env: { DATA_DIR: directory, ADMIN_PASSWORD: 'local-test-only' }, pid: process.pid },
    console: { log() {}, error() {} }, Map, Date, Buffer
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), context);
  const server = moduleObject.exports.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (route, auth = false) => fetch(`http://127.0.0.1:${server.address().port}${route}`, {
    headers: auth ? { authorization: 'Basic ' + Buffer.from('admin:local-test-only').toString('base64') } : {}
  });
  try { await run({ request, directory, existing, cache }); }
  finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); }
}
test('stale-cache viewing and failed forced refresh preserve all saved files and movie links', async () => {
  await withApp(async () => { throw Error('spawn EAGAIN'); }, async ({ request, directory }) => {
    const before = Object.fromEntries(fs.readdirSync(directory).map(name => [name, fs.readFileSync(path.join(directory, name))]));
    const r = await request('/gallery?url=' + encodeURIComponent(url('existing'))); assert.equal(r.status, 200); assert.match(await r.text(), /photo.jpg/);
    const forced = await request('/gallery?refresh=1&url=' + encodeURIComponent(url('existing')));
    assert.equal(forced.status, 200); assert.match(await forced.text(), /保存済みの写真/);
    assert.equal((await request('/test?url=' + encodeURIComponent(url('new')))).status, 401);
    const movie = await request('/movie'); assert.equal(movie.status, 200); assert.match(await movie.text(), /youtu.be/);
    const registration = await request('/admin/update?' + new URLSearchParams({ url: url('new'), date: '2026-10-14', tournament: '試合', opponent: '相手' }), true);
    assert.equal(registration.status, 500);
    for (const [name, data] of Object.entries(before)) assert.deepEqual(fs.readFileSync(path.join(directory, name)), data);
  });
});
test('successful registration appends and preserves existing albums and cache', async () => {
  await withApp(async () => ({ title: 'New', images: [image] }), async ({ request, directory, existing, cache }) => {
    const response = await request('/admin/update?' + new URLSearchParams({ url: url('new'), date: '2026-10-14', tournament: '試合', opponent: '相手' }), true);
    assert.equal(response.status, 200);
    const galleries = JSON.parse(fs.readFileSync(path.join(directory, 'galleries.json')));
    assert.equal(galleries.length, 2); assert.deepEqual(galleries[0], existing[0]);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'gallery-cache.json')));
    assert.deepEqual(saved[url('existing')], cache[url('existing')]); assert.equal(saved[url('new')].images.length, 1);
    assert.equal(fs.readFileSync(path.join(directory, 'current-gallery.txt'), 'utf8'), url('new'));
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 0);
  });
});
test('corrupt saved registration blocks overwrites', async () => {
  await withApp(async () => ({ title: 'New', images: [image] }), async ({ request, directory }) => {
    const response = await request('/admin/update?' + new URLSearchParams({ url: url('new'), date: '2026-10-14', tournament: '試合', opponent: '相手' }), true);
    assert.equal(response.status, 500); assert.equal(fs.readFileSync(path.join(directory, 'galleries.json'), 'utf8'), '{broken');
  }, true);
});
test('overlapping registration and uncached viewing share one Chromium job', async () => {
  const chromium = fakeChromium(); const getPhotos = createPhotoFetcher(chromium, fast);
  await withApp(getPhotos, async ({ request, directory }) => {
    const query = new URLSearchParams({ url: url('new'), date: '2026-10-14', tournament: '試合', opponent: '相手' });
    const responses = await Promise.all([request('/admin/update?' + query, true), request('/gallery?url=' + encodeURIComponent(url('new')))]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    assert.equal(chromium.stats.launches, 1); assert.equal(chromium.stats.maximum, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'galleries.json'))).length, 2);
  });
});
test('cached browsing returns while background retrieval is still pending', async () => {
  let release; let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  await withApp(() => { calls++; return pending; }, async ({ request }) => {
    const responses = await Promise.all([request('/gallery?url=' + encodeURIComponent(url('existing'))), request('/gallery?url=' + encodeURIComponent(url('existing')))]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]); assert.equal(calls, 1);
    release({ title: 'Updated', images: [image] });
    await new Promise(resolve => setImmediate(resolve));
  });
});
test('empty browser result during forced refresh retains last good cache', async () => {
  const getPhotos = createPhotoFetcher(fakeChromium({ empty: true }), fast);
  await withApp(getPhotos, async ({ request, directory }) => {
    const before = fs.readFileSync(path.join(directory, 'gallery-cache.json'));
    const response = await request('/gallery?refresh=1&url=' + encodeURIComponent(url('existing')));
    assert.equal(response.status, 200); assert.match(await response.text(), /保存済みの写真/);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'gallery-cache.json')), before);
  });
});
test('uncertain browser cleanup prevents further launches', async () => {
  const chromium = { launches: 0, async launch() { this.launches++; return { async newPage() { throw Error('page failure'); }, async close() { throw Error('close failure'); } }; } };
  const getPhotos = createPhotoFetcher(chromium, fast);
  await assert.rejects(getPhotos(url('one')), /close failure/);
  await assert.rejects(getPhotos(url('two')), /終了を確認/);
  assert.equal(chromium.launches, 1);
});
test('real application restart preserves 24 registrations, 25 cache entries and all storage bytes', () => {
  const { execFileSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-restart-'));
  const registrations = Array.from({ length: 24 }, (_, i) => ({ date: '2026-10-14', tournament: '既存試合', opponent: `相手${i}`, url: url(`album${i}`) }));
  const cache = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [url(`album${i}`), { time: Date.now(), images: [image] }]));
  fs.writeFileSync(path.join(directory, 'galleries.json'), JSON.stringify(registrations));
  fs.writeFileSync(path.join(directory, 'gallery-cache.json'), JSON.stringify(cache));
  fs.writeFileSync(path.join(directory, 'current-gallery.txt'), url('album0'));
  const before = Object.fromEntries(fs.readdirSync(directory).map(name => [name, fs.readFileSync(path.join(directory, name))]));
  const launcher = `const {app}=require('./server'); const server=app.listen(0,'127.0.0.1',async()=>{try{const root=await fetch('http://127.0.0.1:'+server.address().port+'/');const html=await root.text();if(root.status!==200||(html.match(/class="gallery-card"/g)||[]).length!==24)throw Error('registration display mismatch');const movie=await fetch('http://127.0.0.1:'+server.address().port+'/movie');if(movie.status!==200||!(await movie.text()).includes('youtu.be'))throw Error('movie mismatch');}catch(error){console.error(error);process.exitCode=1}finally{server.close()}});`;
  try {
    for (let i = 0; i < 2; i++) {
      execFileSync(process.execPath, ['-e', launcher], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: directory }, timeout: 15000 });
      for (const [name, data] of Object.entries(before)) assert.deepEqual(fs.readFileSync(path.join(directory, name)), data);
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'gallery-cache.json'))).length, undefined);
      assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(directory, 'gallery-cache.json')))).length, 25);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
