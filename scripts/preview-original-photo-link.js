// Local-only preview: disposable fixture storage, no scraping or production data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-link-preview-'));
const share = '0ib8h7jiztQ0T6eiAoEvjWTejt68Iw422qxy6mW2ptJ';
const album = `https://www.amazon.co.jp/photos/share/${share}`;
const thumbnail = `https://thumbnails-photos.amazon.co.jp/v1/thumbnail/Da9IPAhUTN6HLdl7XdyFeA?viewBox=477&ownerId=A2AAWBN8WHDN3&cdsShareId=${share}`;
// Same user-verified photo at two sizes, then a missing-ID fallback fixture.
const images = [thumbnail, thumbnail.replace('477', '1024'), thumbnail.replace(`&cdsShareId=${share}`, '')];
fs.writeFileSync(path.join(directory, 'gallery-cache.json'), JSON.stringify({ [album]: { time: Date.now(), images } }));
process.env.DATA_DIR = directory;
delete process.env.ADMIN_PASSWORD;
chromium.launch = async () => { throw new Error('Scraping is disabled in this local preview.'); };
const { app } = require('../server');
const server = app.listen(Number(process.env.PREVIEW_PORT || 3001), '127.0.0.1', () => {
  console.log('Local test preview only. Production data is not loaded.');
  console.log(`http://127.0.0.1:${server.address().port}/gallery?url=${encodeURIComponent(album)}`);
  console.log('Tiles 1 and 2: the same verified photo at two sizes. Tile 3: album fallback.');
  console.log('Thumbnail requests and clicked links go directly from your browser to Amazon.');
  console.log('Ctrl+C stops the preview and removes its disposable data.');
});
const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });
process.on('exit', cleanup);
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
