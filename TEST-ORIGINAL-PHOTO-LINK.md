# Original-photo link test branch

This is a test version only. Do not merge into main, deploy, publish, or use/change the existing Railway service or volume as part of testing.

The viewer converts a thumbnail's photo ID and matching `cdsShareId` into the corresponding Amazon Photos individual-page link. It does not download original files. Users finish saving through Amazon's official download control. Links open in a new tab with `noopener noreferrer`.

Only the exact HTTPS thumbnail host and `/v1/thumbnail/{ID}` format are accepted. A single `cdsShareId` must match the currently viewed album. Unknown/malformed URLs fall back to the current shared album; an invalid album URL produces no link. IDs are case-sensitive and are never inferred from ordering or filenames. Existing cache schema, photo fetching and storage code are unchanged.

## Safe local browser check

Use a separate local clone on your own computer. No Railway configuration or credentials are needed. Node 24 was used for validation.

```sh
git clone --branch test/original-photo-link --single-branch https://github.com/amazon-photo-sagae/amazon-photos-cloud-view.git amazon-photos-link-test
cd amazon-photos-link-test
npm install --package-lock=false --no-audit --no-fund
node scripts/preview-original-photo-link.js
```

Open the local address printed by the script in your computer's browser. It binds to loopback only; do not expose it through a public tunnel or deploy it. If port 3001 is occupied, set `PREVIEW_PORT` to another port.

The helper always creates a new temporary DATA_DIR, ignores any inherited DATA_DIR/admin password, and disables Chromium scraping. It does not read production or existing development caches. Ctrl+C removes only its own temporary files. No Chromium installation is needed for this manual preview. Ordinary browser requests for thumbnails and clicked destination links go directly to Amazon; no original files pass through the local server.

- Tiles 1 and 2 deliberately show the **same** user-verified photo with different `viewBox` sizes. Both should open the supplied photo-2 individual URL. This does not validate a second distinct photo.
- Tile 3 removes `cdsShareId` to exercise fallback. Its image may be unavailable; clicking the tile must still offer the shared album, with instructions to select the photo there.
- Open a tile, switch next/previous (including wraparound), swipe on a touch device, close and reopen. Check that the link always follows the selected tile.
- The individual button reads `元画質で保存（Amazon Photosへ）` and says `開いた画面のダウンロード機能で保存してください`.
- Check the new tab in a logged-out/incognito session and complete an official download if permitted. Compare the file with a known original if verifying original quality.

The local preview is intentionally limited to fixtures. Do not use `npm start` with the default `/data` or open uncached production albums for this test.

## Automated validation

```sh
TEST_CHROMIUM_PATH=/usr/bin/chromium node --test test/*.test.js
```

Set `TEST_CHROMIUM_PATH` to an installed Chromium executable on other machines. Browser tests use disposable fixture storage and intercept external navigation; they do not contact Amazon. The new test verifies the emitted page, link updates, new-tab destination, opener isolation, fallback, next/previous/wraparound, touch handlers, close/reopen, viewport bounds, zero scraping launches, and unchanged fixture cache bytes. Existing route, persistence and browser-fetch tests remain enabled.

## Still unverified

The user supplied one real matched thumbnail/individual-page pair. Multiple distinct photos and albums, album-end photos with `pageIndex=0`, actual Amazon destinations/downloads, iOS Safari/Android behavior and expired/revoked sharing have not been validated by these offline tests. Amazon is blocked by this cloud environment's network policy. URL validation cannot establish that a photo still exists or that its shared link remains accessible. Treat this branch as experimental until those checks pass.
