const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseExpectedPhotoUrl, expectedPhotoStatus } = require('../scripts/expected-photo-url');
const album = 'https://www.amazon.co.jp/photos/share/test-share';
const base = `${album}/gallery/test-photo`;
const destination = { href: `${base}?pageIndex=0`, individual: true };

test('reference URLs accept optional pageIndex, query order, additional parameters, trailing slash and fragment', () => {
  for (const suffix of ['', '?pageIndex=0', '?pageIndex=3', '?foo=1&pageIndex=0', '?pageIndex=0&foo=1', '/', '/?pageIndex=0', '?foo=1#view', '#view']) {
    assert.equal(parseExpectedPhotoUrl(base + suffix).albumHref, album);
    assert.equal(parseExpectedPhotoUrl(base + suffix).photoId, 'test-photo');
    assert.doesNotMatch(expectedPhotoStatus(destination, base + suffix), /不一致/);
  }
  assert.equal(parseExpectedPhotoUrl(`  ${base}  `).photoId, 'test-photo');
  assert.equal(parseExpectedPhotoUrl(base.replace('www.amazon', 'WWW.AMAZON')).photoId, 'test-photo');
});

test('reference parsing rejects foreign hosts, userinfo, ports, traversal and missing IDs', () => {
  for (const value of [null, '', base.replace('https:', 'http:'), base.replace('.co.jp/', '.co.jp.evil.example/'), base.replace('https://', 'https://user@'), base.replace('.co.jp/', '.co.jp:443/'), base.replace('/photos/', '/extra/../photos/'), `${album}/gallery/`, `${album}/gallery/a/b`, `${album}/gallery/%2e%2e`, `${album}/gallery/test-photo\n?x=1`]) {
    assert.equal(parseExpectedPhotoUrl(value), null, String(value));
  }
});

test('photo identity differs from query differences and never means visual confirmation', () => {
  assert.match(expectedPhotoStatus(destination, destination.href), /URL一致.*目視確認/);
  assert.match(expectedPhotoStatus(destination, `${base}?pageIndex=2&foo=1`), /写真ID一致.*補助情報/);
  assert.match(expectedPhotoStatus(destination, base.replace('test-photo', 'other-photo')), /写真ID不一致/);
  assert.match(expectedPhotoStatus(destination, base.replace('test-share', 'other-share')), /写真ID不一致/);
  assert.equal(expectedPhotoStatus(destination, ''), '照合用URLは未入力');
  assert.equal(expectedPhotoStatus({ href: album, individual: false }, base), '共有アルバムへの案内');
});
