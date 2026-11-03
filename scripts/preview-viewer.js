const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateShareUrl } = require('../photo-fetcher');

// Execute the real route in a preview-only module context. Do not change global
// process.env, require.cache, Playwright, the production clock or storage code.
function loadPreviewViewer(directory) {
  const root = path.resolve(directory);
  const files = new Set(['current-gallery.txt', 'galleries.json', 'gallery-cache.json'].map(name => path.join(root, name)));
  const now = Date.now();
  const audit = { readPaths: [], writeAttempts: 0, fetchAttempts: 0 };
  const check = file => {
    const resolved = path.resolve(String(file));
    if (!files.has(resolved)) throw Error('Preview attempted to access storage outside its disposable files.');
    // The directory is newly created. Reject a substituted symlink too.
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) throw Error('Preview storage cannot be a symlink.');
    audit.readPaths.push(resolved);
    return resolved;
  };
  const readonlyFs = new Proxy({}, { get(target, name) {
    if (name === 'existsSync') return file => fs.existsSync(check(file));
    if (name === 'readFileSync') return (file, encoding) => {
      const resolved = check(file);
      const contents = fs.readFileSync(resolved, encoding);
      if (path.basename(resolved) !== 'gallery-cache.json') return contents;
      // Freshness is preview-only and in memory. Never rewrite stored timestamps.
      const cache = JSON.parse(contents);
      for (const entry of Object.values(cache)) entry.time = now;
      return JSON.stringify(cache);
    };
    return () => { audit.writeAttempts++; throw Error('Storage writes are disabled in the preview viewer.'); };
  } });
  class PreviewDate extends Date { static now() { return now; } }
  const moduleObject = { exports: {} };
  const requirePreview = name => {
    if (name === 'fs') return readonlyFs;
    if (name === 'playwright') return { chromium: {} };
    if (name === './photo-fetcher') return {
      validateShareUrl,
      createPhotoFetcher: () => async () => { audit.fetchAttempts++; throw Error('Photo fetching is disabled in this preview.'); }
    };
    if (name === './amazon-photo-link') return require('../amazon-photo-link');
    if (name === 'express' || name === 'node:path') return require(name);
    throw Error(`Unexpected dependency in preview viewer: ${name}`);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), {
    require: requirePreview, module: moduleObject,
    process: { env: { DATA_DIR: root }, pid: process.pid },
    console, Date: PreviewDate, Buffer, URL
  }, { filename: 'server.js (isolated preview)' });
  return { app: moduleObject.exports.app, audit };
}

function sampleGalleryHtml(html, count) {
  const sources = Array.from({ length: count }, (_, i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="hsl(${i * 67 % 360},45%,30%)"/><text x="450" y="280" text-anchor="middle" fill="white" font-size="62">SAMPLE ${i + 1}</text><text x="450" y="370" text-anchor="middle" fill="white" font-size="28">Local preview - not an Amazon photo</text></svg>`;
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  });
  let index = 0;
  const thumbnails = html.replace(/(<img\s+src=")[^"]*("\s+class="photo")/g, (match, before, after) => before + sources[index++] + after);
  const assignment = /viewerImage\.src =\s*photos\[currentIndex\];/g;
  // Fail closed if the upstream markup changes instead of serving remote images.
  if (index !== count || [...thumbnails.matchAll(assignment)].length !== 1 || !thumbnails.includes('<script>')) throw Error('The gallery markup changed; offline preview must be updated.');
  return thumbnails.replace(assignment, 'viewerImage.src = previewImageSources[currentIndex];')
    .replace('<script>', `<script>\nconst previewImageSources = ${JSON.stringify(sources)};`);
}

module.exports = { loadPreviewViewer, sampleGalleryHtml };
