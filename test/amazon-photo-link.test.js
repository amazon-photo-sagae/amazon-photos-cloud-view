const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAmazonPhotoLink } = require('../amazon-photo-link');

const share = '0ib8h7jiztQ0T6eiAoEvjWTejt68Iw422qxy6mW2ptJ';
const id = 'Da9IPAhUTN6HLdl7XdyFeA';
const album = `https://www.amazon.co.jp/photos/share/${share}`;
const thumbnail = `https://thumbnails-photos.amazon.co.jp/v1/thumbnail/${id}?viewBox=477&ownerId=A2AAWBN8WHDN3&cdsShareId=${share}`;

test('the supplied real thumbnail produces exactly the supplied individual URL', () => {
  assert.deepEqual(buildAmazonPhotoLink(thumbnail, album), {
    href: `${album}/gallery/${id}?pageIndex=0`, individual: true
  });
  assert.deepEqual(buildAmazonPhotoLink(thumbnail.replace('477', '1024'), album), buildAmazonPhotoLink(thumbnail, album));
});

test('malformed and mismatched thumbnails always fall back to the current album', () => {
  const cases = [
    null, '', 'javascript:alert(1)',
    thumbnail.replace('https:', 'http:'),
    thumbnail.replace('.co.jp/', '.co.jp.evil.example/'),
    thumbnail.replace('https://', 'https://user@'),
    thumbnail.replace('.co.jp/', '.co.jp:443/'),
    thumbnail.replace('/v1/', '/other/../v1/'),
    thumbnail.replace('/v1/', '/v2/'),
    thumbnail.replace(id, ''),
    thumbnail.replace(id, `${id}/extra`),
    thumbnail.replace(id, '%2e%2e'),
    thumbnail.replace(id, 'photo.jpg'),
    thumbnail.replace('cdsShareId=', 'other='),
    thumbnail.replace(`cdsShareId=${share}`, 'cdsShareId=other-album'),
    thumbnail.replace(`cdsShareId=${share}`, 'cdsShareId='),
    `${thumbnail}&cdsShareId=${share}`,
    `${thumbnail}&cdsShareId=other`,
    `${thumbnail}#fragment`,
    `${thumbnail}\n`,
  ];
  for (const value of cases) assert.deepEqual(buildAmazonPhotoLink(value, album), { href: album, individual: false }, String(value));
});

test('invalid album URLs never become outbound destinations', () => {
  for (const value of [null, '', 'javascript:alert(1)', `${album}/gallery/${id}`, album.replace('https:', 'http:'), album.replace('.co.jp/', '.co.jp.evil.example/'), album.replace('https://', 'https://user@'), `${album}#fragment`, `${album}/../other`]) {
    assert.equal(buildAmazonPhotoLink(thumbnail, value), null, String(value));
  }
});

test('album query parameters cannot change the fixed outbound destination', () => {
  assert.equal(buildAmazonPhotoLink(thumbnail, `${album}/?next=https://evil.example`).href, `${album}/gallery/${id}?pageIndex=0`);
});
