const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { buildAmazonPhotoLink } = require('../amazon-photo-link');
const { parseExpectedPhotoUrl, expectedPhotoStatus } = require('./expected-photo-url');

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const positions = { first: '先頭', middle: '中間', last: '最後', other: 'その他' };
const results = ['未確認', '同じ写真が開いた', '違う写真が開いた', '開けなかった'];

function createPreview() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-link-preview-'));
  const csrf = crypto.randomBytes(24).toString('hex');
  const originalLaunch = chromium.launch;
  const blockedLaunch = async () => { throw new Error('Scraping is disabled in this local preview.'); };
  chromium.launch = blockedLaunch;
  let viewer;
  let records = [];

  function rebuild() {
    const cache = {};
    for (const record of records) {
      cache[record.album] ??= { time: Date.now(), images: [] };
      record.index = cache[record.album].images.length;
      cache[record.album].images.push(record.thumbnail);
    }
    fs.writeFileSync(path.join(directory, 'gallery-cache.json'), JSON.stringify(cache));
    // Load the unchanged viewer with disposable data; expose no admin routes.
    const previousDataDir = process.env.DATA_DIR;
    const previousPassword = process.env.ADMIN_PASSWORD;
    try {
      process.env.DATA_DIR = directory;
      delete process.env.ADMIN_PASSWORD;
      delete require.cache[require.resolve('../server')];
      viewer = require('../server').app;
    } finally {
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
      if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previousPassword;
    }
  }

  const share = '0ib8h7jiztQ0T6eiAoEvjWTejt68Iw422qxy6mW2ptJ';
  const album = `https://www.amazon.co.jp/photos/share/${share}`;
  const thumbnail = `https://thumbnails-photos.amazon.co.jp/v1/thumbnail/Da9IPAhUTN6HLdl7XdyFeA?viewBox=477&ownerId=A2AAWBN8WHDN3&cdsShareId=${share}`;
  const expected = `${album}/gallery/Da9IPAhUTN6HLdl7XdyFeA?pageIndex=0`;
  records = [
    { label: '前回の写真2（提供済みURL）', album, thumbnail, expected, result: '未確認' },
    { label: '同じ写真2（サイズ違い1024・生成例）', album, thumbnail: thumbnail.replace('477', '1024'), expected, result: '未確認' },
    { label: '共有IDなし（安全な案内の確認用）', album, thumbnail: thumbnail.replace(`&cdsShareId=${share}`, ''), expected: '', result: '未確認' },
    { label: '写真IDなし（安全な案内の確認用）', album, thumbnail: thumbnail.replace('Da9IPAhUTN6HLdl7XdyFeA', ''), expected: '', result: '未確認' }
  ];
  try { rebuild(); }
  catch (error) {
    chromium.launch = originalLaunch;
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  const app = express();
  app.use((req, res, next) => {
    if (!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(req.headers.host || '')) return res.sendStatus(403);
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; img-src https://thumbnails-photos.amazon.co.jp data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use((req, res, next) => {
    if (req.method === 'POST' && (req.body?.csrf !== csrf || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`))) return res.sendStatus(403);
    next();
  });

  function dashboard(error = '', values = {}) {
    const albums = [...new Set(records.map(record => record.album))];
    return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>元画質保存 第2段階テスト</title>
<style>body{font-family:system-ui,sans-serif;max-width:1050px;margin:auto;padding:20px;background:#f5f5f5;color:#222}section{background:white;padding:18px;margin:18px 0;border-radius:10px}label{display:block;margin:14px 0}input[type=url],select{box-sizing:border-box;width:100%;padding:10px;margin-top:5px}button,.viewer-link{display:inline-block;padding:12px;background:#173e63;color:white;border:0;border-radius:6px;text-decoration:none}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.scroll{overflow:auto}.error{color:#a00}code{overflow-wrap:anywhere}small{display:block;margin:8px 0}</style>
<h1>元画質保存 第2段階テスト</h1>
<p>このPCだけのテスト画面です。本番データは読み込みません。追加したURLと確認結果は終了すると消えます。</p>
<p>画像はブラウザからAmazonへ直接読み込みます。自動巡回・元画像の自動取得・サーバー転送は行いません。</p>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
<section><h2>1. 確認する写真を追加</h2>
<p>同じ写真のURLをコピーして入力してください。先頭・中間・最後、別アルバムの写真を1枚ずつ追加できます。</p>
<form action="/photos" method="post"><input type="hidden" name="csrf" value="${csrf}">
<label>写真の位置<select name="position">${Object.entries(positions).map(([key, label]) => `<option value="${key}"${values.position === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
<label>共有アルバムURL<input name="album" type="url" required value="${escape(values.album || '')}" placeholder="https://www.amazon.co.jp/photos/share/…"></label>
<label>サムネイル画像URL<input name="thumbnail" type="url" required value="${escape(values.thumbnail || '')}" placeholder="https://thumbnails-photos.amazon.co.jp/…"></label>
<label>公式画面でその写真を開いた個別URL（照合用・任意）<input name="expected" type="url" value="${escape(values.expected || '')}" placeholder="https://www.amazon.co.jp/photos/share/…/gallery/…?pageIndex=0"></label>
<label><input type="checkbox" name="variant" value="yes"${!error || values.variant === 'yes' ? ' checked' : ''}>同じ写真のサイズ違いも追加する（viewBox=477 と 1024）</label>
<button type="submit">テストに追加</button></form></section>
<section><h2>2. 快適ビューで確認</h2>
<p>各アルバムを開き、写真を選んで「元画質で保存（Amazon Photosへ）」を押してください。写真切り替え・前後移動でも確認します。</p>
${albums.map((url, i) => `<p><a class="viewer-link" href="/gallery?url=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">アルバム${i + 1}の快適ビューを開く</a><small><code>${escape(url)}</code></small></p>`).join('')}
<p>テストの並びは追加順です。「先頭・中間・最後」は元のAmazonアルバムでの位置を表すメモで、自動判定はしていません。</p></section>
<section><h2>3. 確認結果を記録</h2><p>共有IDと写真IDを照合します。pageIndexなどの違いは補助情報として区別します。同じ写真が表示されたかはご自身で確認してください。写真が表示されなくても、枠を押して保存先の案内は確認できます。</p>
<div class="scroll"><table><thead><tr><th>対象</th><th>生成リンク・URL照合</th><th>ブラウザでの確認結果</th></tr></thead><tbody>
${records.map((record, i) => {
      const destination = buildAmazonPhotoLink(record.thumbnail, record.album);
      const status = expectedPhotoStatus(destination, record.expected);
      return `<tr><td>${escape(record.label)}<small>アルバム${albums.indexOf(record.album) + 1}・テスト画面の${record.index + 1}枚目</small></td>
<td><a target="_blank" rel="noopener noreferrer" href="${escape(destination.href)}">${destination.individual ? '生成した個別ページを開く' : '共有アルバムを開く'}</a><small>${escape(status)}</small></td>
<td><form action="/results" method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="index" value="${i}"><select name="result" aria-label="${escape(record.label)}の確認結果">${results.map(result => `<option${record.result === result ? ' selected' : ''}>${escape(result)}</option>`).join('')}</select><button type="submit">記録</button></form></td></tr>`;
    }).join('')}
</tbody></table></div></section>
<p>終了はPowerShellで Ctrl+C。テスト結果を残したい場合は、終了前にこの画面を印刷・PDF保存してください。</p></html>`;
  }

  app.get('/', (req, res) => res.send(dashboard()));
  app.post('/photos', (req, res) => {
    try {
      if (records.length >= 100) throw Error('写真は最大100件です。終了して起動し直すと初期状態に戻せます。');
      const { album: inputAlbum, thumbnail: inputThumbnail, expected: inputExpected = '', position } = req.body;
      if (![inputAlbum, inputThumbnail, inputExpected].every(value => typeof value === 'string' && value.length <= 4096) || !Object.hasOwn(positions, position)) throw Error('入力内容を確認してください。');
      const destination = buildAmazonPhotoLink('', inputAlbum.trim());
      if (!destination) throw Error('共有アルバムURLは https://www.amazon.co.jp/photos/share/共有ID の形式で入力してください。');
      const thumb = inputThumbnail.trim();
      // The viewer inserts image src attributes: disallow markup even in
      // deliberately malformed ID fixtures. Never load non-Amazon hosts.
      if (!/^https:\/\/thumbnails-photos\.amazon\.co\.jp\/[^\s"'<>`\\#]+$/.test(thumb)) throw Error('サムネイルURLのホスト・形式を確認してください。');
      const check = inputExpected.trim();
      if (check) {
        const reference = parseExpectedPhotoUrl(check);
        if (!reference) throw Error('照合用URLはAmazon Photosの個別写真URLを入力してください。pageIndexの有無や追加パラメータは問いません。');
        if (reference.albumHref !== destination.href) throw Error('照合用URLの共有アルバムIDが、入力した共有アルバムと異なります。');
      }
      const additions = [{ label: `${positions[position]}（入力した写真）`, album: destination.href, thumbnail: thumb, expected: check, result: '未確認' }];
      if (req.body.variant === 'yes' && buildAmazonPhotoLink(thumb, destination.href)?.individual) {
        for (const size of ['477', '1024']) {
          const variant = new URL(thumb);
          variant.searchParams.set('viewBox', size);
          if (variant.href !== thumb) additions.push({ ...additions[0], label: `${positions[position]}（同じ写真・サイズ違い${size}）`, thumbnail: variant.href });
        }
      }
      if (records.length + additions.length > 100) throw Error('写真は最大100件です。');
      records.push(...additions);
      rebuild();
      res.redirect(303, '/');
    } catch (error) { res.status(400).send(dashboard(error.message, req.body)); }
  });
  app.post('/results', (req, res) => {
    if (!/^(0|[1-9][0-9]*)$/.test(req.body.index || '') || !records[Number(req.body.index)] || !results.includes(req.body.result)) return res.sendStatus(400);
    records[Number(req.body.index)].result = req.body.result;
    res.redirect(303, '/');
  });
  app.get('/gallery', (req, res, next) => {
    if (typeof req.query.url !== 'string' || !records.some(record => record.album === req.query.url)) return res.status(404).send('追加済みのテスト用アルバムだけ開けます。確認画面へ戻ってください。');
    req.url = `/gallery?url=${encodeURIComponent(req.query.url)}`;
    viewer(req, res, next);
  });
  app.use((req, res) => res.sendStatus(404));

  return {
    app,
    directory,
    cleanup() {
      if (chromium.launch === blockedLaunch) chromium.launch = originalLaunch;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

module.exports = { createPreview };
