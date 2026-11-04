// Pure URL conversion only: no network requests or browser launches.
function buildAmazonPhotoLink(thumbnailUrl, albumUrl) {
  if (typeof albumUrl !== 'string') return null;
  const album = /^https:\/\/www\.amazon\.co\.jp\/photos\/share\/([A-Za-z0-9_-]+)\/?(?:\?[^#\s]*)?$/.exec(albumUrl);
  if (!album) return null;
  const albumHref = `https://www.amazon.co.jp/photos/share/${album[1]}`;
  const fallback = { href: albumHref, individual: false };
  if (typeof thumbnailUrl !== 'string') return fallback;
  // Match the original string too; reject normalized paths, ports and userinfo.
  const thumbnail = /^https:\/\/thumbnails-photos\.amazon\.co\.jp\/v1\/thumbnail\/([A-Za-z0-9_-]+)\?[^#\s]*$/.exec(thumbnailUrl);
  if (!thumbnail) return fallback;
  try {
    const url = new URL(thumbnailUrl);
    const shares = url.searchParams.getAll('cdsShareId');
    if (shares.length !== 1 || shares[0] !== album[1]) return fallback;
    return {
      href: `${albumHref}/gallery/${encodeURIComponent(thumbnail[1])}?pageIndex=0`,
      individual: true
    };
  } catch {
    return fallback;
  }
}

module.exports = { buildAmazonPhotoLink };
