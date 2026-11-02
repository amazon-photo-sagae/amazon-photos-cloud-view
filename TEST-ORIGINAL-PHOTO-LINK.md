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

Open the local address printed by the script in your computer's browser. Stage two opens a Japanese dashboard at `http://127.0.0.1:3001/`. It binds to loopback only; do not expose it through a public tunnel or deploy it. If port 3001 is occupied, set `PREVIEW_PORT` to another port.

The helper always creates a new temporary DATA_DIR, ignores any inherited DATA_DIR/admin password, and disables Chromium scraping. It does not read production or existing development caches. Only the local dashboard, fixture-backed viewer and local test forms are exposed; admin, scraping and uncached album routes are not exposed. A supplied `refresh=1` is stripped. Ctrl+C removes only its own temporary files. No Chromium installation is needed for this manual preview. Ordinary browser requests for thumbnails and clicked destination links go directly to Amazon; no original files pass through the local server.

- Tiles 1 and 2 deliberately show the **same** user-verified photo with different `viewBox` sizes. Both should open the supplied photo-2 individual URL. This does not validate a second distinct photo.
- Tile 3 removes `cdsShareId` to exercise fallback. Its image may be unavailable; clicking the tile must still offer the shared album, with instructions to select the photo there.
- Tile 4 removes the photo ID to exercise the other missing-ID fallback. It is an intentionally invalid thumbnail, not a real fourth photo.
- Open a tile, switch next/previous (including wraparound), swipe on a touch device, close and reopen. Check that the link always follows the selected tile.
- The individual button reads `元画質で保存（Amazon Photosへ）` and says `開いた画面のダウンロード機能で保存してください`.
- Check the new tab in a logged-out/incognito session and complete an official download if permitted. Compare the file with a known original if verifying original quality.

The local preview is intentionally limited to fixtures. Do not use `npm start` with the default `/data` or open uncached production albums for this test.

## 第2段階：Windowsでの確認（1項目ずつ進める）

前回使ったローカルのテスト用フォルダーを使います。本番サービスや環境設定の操作は不要です。画面の入力内容はGitHubに送信されません。

1. 前回のテストサーバーが動いていれば、そのPowerShellで `Ctrl+C` を押して止めます。
2. テスト用フォルダーでPowerShellを開き、`git status --short --branch` を実行します。ローカル変更があれば上書きせず確認してください。`node_modules/` は導入済み依存関係です。
3. ブランチが異なる場合は `git switch test/original-photo-link` を実行します。
4. `git pull --ff-only origin test/original-photo-link` でテストブランチだけを更新します。mainへの切り替えやマージはしません。
5. `node scripts/preview-original-photo-link.js` を実行します。前回の依存関係が残っていれば再インストールは不要です。
6. PCのブラウザで `http://127.0.0.1:3001/` を開きます。クラウド環境で同じコマンドを実行しても、Windows側にはサーバーは起動しません。
7. まず「アルバム1の快適ビューを開く」で前回の写真を再確認します。最初の2枚は同じ写真のサイズ違い、3・4枚目は安全なアルバム案内の確認用です。
8. 画面に戻り、追加したい写真の位置とURLを入力して「テストに追加」を押します。共有アルバムURLとサムネイル画像URLは必須です。公式個別URLは任意ですが、一致確認のため入力を推奨します。
9. 同じアルバムの先頭・中間・最後、続いて別アルバムの写真を1枚ずつ追加します。可能なら別アルバムも先頭・中間・最後を用意します。位置は人が選ぶメモです。テスト画面での並びは追加順で、Amazon側の並びや総枚数は調べません。
10. サイズ違いのチェックを入れると、入力URLの `viewBox` だけを477・1024へ変更した確認用サムネイルも追加します。同じ写真であることは利用者が公式ページで確認します。サイズ違いは別の実写真の検証件数には数えません。
11. 各アルバムの快適ビューから先頭・中間・最後の写真を開き、保存ボタンで同じ写真になるか確認します。最後の写真でも `pageIndex=0` で直接開けるかに注意してください。
12. 確認画面に戻り、各写真の結果を選んで「記録」を押します。照合用URLは `pageIndex` の省略・順序違い・追加パラメータ・末尾スラッシュに対応します。共有IDと写真IDが同じで補助情報だけが異なる場合は「写真ID一致・URLの補助情報が異なります」と表示します。別の写真IDは「写真ID不一致」です。いずれも実写真の目視確認とは区別してください。
13. 結果は画面の印刷・PDF保存などで手元に残し、PowerShellで `Ctrl+C` を押して終了します。追加URLと結果は終了時に消えます。すでに開いていた快適ビューのタブには追加前の写真一覧が残るため、追加後は確認画面のリンクから開き直してください。

### 写真1枚につき用意するURL

- 共有アルバムURL：`https://www.amazon.co.jp/photos/share/共有ID`
- 同じ写真のサムネイル画像URL：既存の快適ビューで「画像アドレスをコピー」して取得できます。調査のためだけに本番の更新・再取得操作は行わないでください。
- Amazonの公式画面で同じ写真を開いた個別URL：`https://www.amazon.co.jp/photos/share/共有ID/gallery/写真ID`（`pageIndex` や追加パラメータが付いていても入力できます）

Cookie、パスワード、認証ヘッダーは不要です。個別URLから逆算した架空のサムネイルではなく、実際の同じ写真の画像URLを使ってください。画像URLが期限切れなどで表示できない場合は「開けなかった」と記録し、リンクの対応不良とは区別してください。

## Automated validation

```sh
TEST_CHROMIUM_PATH=/usr/bin/chromium node --test test/*.test.js
```

Set `TEST_CHROMIUM_PATH` to an installed Chromium executable on other machines. Browser tests use disposable fixture storage and intercept external navigation; they do not contact Amazon. The new test verifies the emitted page, link updates, new-tab destination, opener isolation, fallback, next/previous/wraparound, touch handlers, close/reopen, viewport bounds, zero scraping launches, and unchanged fixture cache bytes. Existing route, persistence and browser-fetch tests remain enabled.

## Still unverified

The user reported successful manual verification of all 12 stage-two entries, including first/middle/last photos, thumbnail size variants and missing-ID fallback. Earlier they reported opening the correct official page and downloading a high-resolution JPEG. These are user-reported results, not new cloud verification. Coverage of specific different albums/devices and revoked or expired sharing has not been independently established. Automated tests use synthetic photos and intercept all external browser requests. They verify local input validation, result recording, identity comparison, inaccessible admin/uncached routes, zero scraper calls and disposable-cache cleanup. The exact URL that caused the reported form error has not yet been supplied; the identified overly restrictive query-format check has been replaced and common variants have regression tests. URL validation cannot establish that a photo still exists or that its shared link remains accessible.
