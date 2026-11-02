// Compare photo identity, not optional UI state such as pageIndex or query order.
function parseExpectedPhotoUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:\?[^#\s]*)?(?:#[^\s]*)?$/i.exec(value.trim());
  if (!raw || !/^www\.amazon\.co\.jp$/i.test(raw[1])) return null;
  const path = /^\/photos\/share\/([A-Za-z0-9_-]+)\/gallery\/([A-Za-z0-9_-]+)\/?$/.exec(raw[2]);
  if (!path) return null;
  try {
    const url = new URL(value.trim());
    if (url.origin !== 'https://www.amazon.co.jp' || url.username || url.password || url.port) return null;
    return {
      albumHref: `https://www.amazon.co.jp/photos/share/${path[1]}`,
      photoId: path[2],
      href: url.href
    };
  } catch { return null; }
}

function expectedPhotoStatus(destination, expected) {
  if (!destination.individual) return '共有アルバムへの案内';
  if (!expected) return '照合用URLは未入力';
  const actual = parseExpectedPhotoUrl(destination.href);
  const reference = parseExpectedPhotoUrl(expected);
  if (!actual || !reference || actual.albumHref !== reference.albumHref || actual.photoId !== reference.photoId) return '写真ID不一致（選んだ写真を確認してください）';
  return actual.href === reference.href
    ? 'URL一致（写真の目視確認は別途必要）'
    : '写真ID一致・URLの補助情報が異なります（写真の目視確認は別途必要）';
}

module.exports = { parseExpectedPhotoUrl, expectedPhotoStatus };
