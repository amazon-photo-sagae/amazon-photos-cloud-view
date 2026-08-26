const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEFAULT_GALLERY_URL = "https://www.amazon.co.jp/photos/share/vT10OCeuywTQHxn52cYBovcNvMHI9aUSk90toM5GyeR";
let currentGalleryUrl = DEFAULT_GALLERY_URL;
const GALLERY_FILE = "/data/current-gallery.txt";
const GALLERIES_FILE = "/data/galleries.json";
let galleries = [];
const galleryCache = new Map();
const CACHE_TIME = 12 * 60 * 60 * 1000; // 12時間

// 保存済みのアルバムURLがあれば読み込む
try {
  if (fs.existsSync(GALLERY_FILE)) {
    const savedUrl = fs.readFileSync(GALLERY_FILE, "utf8").trim();
    if (savedUrl) {
      currentGalleryUrl = savedUrl;
    }
  }
} catch (error) {
  console.error("保存済みアルバムURLの読み込みに失敗:", error.message);
}

// 保存済みの複数アルバムがあれば読み込む
try {
  if (fs.existsSync(GALLERIES_FILE)) {
    const savedGalleries = fs.readFileSync(GALLERIES_FILE, "utf8");
    galleries = JSON.parse(savedGalleries);
  }
} catch (error) {
  console.error("保存済み複数アルバムの読み込みに失敗:", error.message);
}
function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// トップページ
app.get("/", (req, res) => {
  const galleryList = galleries.length
    ? galleries.map((gallery) => `
        <div class="gallery-card">
          <div class="gallery-name">${escapeHtml(gallery.name)}</div>
          <a href="/gallery?url=${encodeURIComponent(gallery.url)}">写真を見る</a>
        </div>
      `).join("")
    : `<p class="empty">まだ写真は登録されていません。</p>`;

  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>寒河江ボーイズ PHOTO</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 30px 20px;
    background: #f5f5f5;
    color: #222;
  }

  h1 {
    text-align: center;
    margin-bottom: 8px;
  }

  .message {
    text-align: center;
    color: #666;
    margin-bottom: 30px;
  }

  .gallery-card {
    background: white;
    padding: 20px;
    margin-bottom: 15px;
    border-radius: 12px;
  }

  .gallery-name {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 12px;
  }

  .gallery-card a {
    display: block;
    padding: 14px;
    background: #111;
    color: white;
    text-decoration: none;
    text-align: center;
    border-radius: 8px;
    font-weight: bold;
  }

  .empty {
    text-align: center;
    color: #777;
  }
</style>
</head>

<body>

<h1>寒河江ボーイズ PHOTO</h1>
<p class="message">見たい試合を選んでください</p>

${galleryList}

</body>
</html>
  `);
});
// 管理画面用のパスワード認証
function requireAdminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (auth) {
    const encoded = auth.split(" ")[1];
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const [username, password] = decoded.split(":");

    if (username === "admin" && password === ADMIN_PASSWORD) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="Amazon Photos Admin"');
  return res.status(401).send("管理画面を開くには認証が必要です。");
}
// 管理画面
app.get("/admin", requireAdminAuth, (req, res) => {
  const adminGalleryList = galleries.length
    ? galleries.map((gallery, index) => `
        <div class="admin-gallery">
   <div class="admin-gallery">
  <strong>${escapeHtml(gallery.name)}</strong>
 <a href="/admin/delete?index=${index}" onclick="return confirm('この試合を本当に削除しますか？');">削除</a>
</div>     
      `).join("")
    : `<p>まだ試合は登録されていません。</p>`;
  
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amazon Photos 管理画面</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 15px;
    font-size: 16px;
    margin: 10px 0 15px;
  }
  button {
    width: 100%;
    padding: 16px;
    font-size: 17px;
    font-weight: bold;
    cursor: pointer;
  }
</style>
</head>
<body>

<h1>Amazon Photos 管理画面</h1>

<p>写真撮影係から届いたAmazon Photosの共有URLを貼り付けてください。</p>

<h2>登録済みの試合</h2>

${adminGalleryList}

<h2>新しい試合を登録</h2>

<form action="/admin/update" method="GET">

<input
  type="text"
  name="name"
  placeholder="試合名（例：湘南B）"
  required
>
  <input
    type="url"
    name="url"
    placeholder="Amazon Photosの共有URL"
    required
  >
  <button type="submit">このアルバムに更新</button>
</form>

</body>
</html>
  `);
});
// 登録済みの試合を削除
app.get("/admin/delete", requireAdminAuth, (req, res) => {
  const index = Number(req.query.index);

  if (!Number.isInteger(index) || index < 0 || index >= galleries.length) {
    return res.status(400).send("削除する試合が見つかりません。");
  }

  const deletedGallery = galleries[index];

  galleries.splice(index, 1);

  fs.writeFileSync(
    GALLERIES_FILE,
    JSON.stringify(galleries, null, 2),
    "utf8"
  );

  galleryCache.delete(deletedGallery.url);

  res.redirect("/admin");
});
// 管理画面からアルバムを更新
app.get("/admin/update", requireAdminAuth, async (req, res) => {
const newUrl = req.query.url;
const name = req.query.name;
  if (
    !name ||
    !newUrl ||
    !newUrl.startsWith("https://www.amazon.co.jp/photos/share/")
  ) {
    return res.status(400).send(`
      <h2>Amazon Photosの共有URLを確認してください。</h2>
      <p><a href="/admin">管理画面に戻る</a></p>
    `);
  }

  try {
    // 新しいAmazon Photosを最初から読み込む
    const result = await getAmazonPhotos(newUrl);
    const images = result.images;

    if (!images.length) {
      return res.status(500).send(`
        <h2>写真を取得できませんでした。</h2>
        <p><a href="/admin">管理画面に戻る</a></p>
      `);
    }

    // 今後トップページで表示するアルバムを変更
    currentGalleryUrl = newUrl;
    fs.writeFileSync(GALLERY_FILE, newUrl, "utf8");
    
galleries.push({
  name: name,
  url: newUrl
});
fs.writeFileSync(GALLERIES_FILE, JSON.stringify(galleries, null, 2), "utf8");
    // 新しいアルバムをキャッシュに追加
   galleryCache.set(newUrl, {
      time: Date.now(),
      images: images
    });

    res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>更新完了</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 40px 20px;
    text-align: center;
  }

  a {
    display: block;
    padding: 16px;
    margin-top: 20px;
    background: #111;
    color: white;
    text-decoration: none;
    border-radius: 8px;
  }
</style>
</head>
<body>

<h1>${escapeHtml(name)} を登録しました！</h1>

<p><strong>${images.length}枚</strong>の写真を読み込みました。</p>

<p>これから保護者用の短いURLを開くと、今回のアルバムが表示されます。</p>

<a href="/">保護者用の写真を見る</a>

<a href="/admin">管理画面に戻る</a>

</body>
</html>
    `);

  } catch (error) {
    res.status(500).send(`
      <h2>更新中にエラーが発生しました。</h2>
      <pre>${escapeHtml(error.message)}</pre>
      <p><a href="/admin">管理画面に戻る</a></p>
    `);
  }
});
// Amazon Photosから画像URLを取得
async function getAmazonPhotos(shareUrl) {

  let browser;

  try {

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await browser.newPage({
      viewport: {
        width: 1280,
        height: 900
      }
    });

    const networkImages = new Set();

    page.on("response", async (response) => {

      try {

        const url = response.url();

        const headers = await response.allHeaders();
        const contentType = headers["content-type"] || "";

        if (
          contentType.startsWith("image/") &&
          (
            url.includes("thumbnails-photos.amazon.co.jp") ||
            url.includes("/thumbnail/")
          )
        ) {
          networkImages.add(url);
        }

      } catch (e) {
        // 読めない通信は無視
      }

    });

    await page.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(7000);

   // 写真が増えなくなるまで自動でスクロール
let lastCount = 0;
let stableCount = 0;

for (let i = 0; i < 200; i++) {
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(1000);

  const currentCount = networkImages.size;

  if (currentCount === lastCount) {
    stableCount++;
  } else {
    stableCount = 0;
    lastCount = currentCount;
  }

  // 5回続けて写真が増えなければ最後まで来たと判断
  if (stableCount >= 5) {
    break;
  }
}

    const title = await page.title();

    const images = Array.from(networkImages);

    return {
      title,
      images
    };

  } finally {

    if (browser) {
      await browser.close();
    }

  }
}


// テスト用JSON
app.get("/test", async (req, res) => {

  const shareUrl = req.query.url;

  if (!shareUrl) {

    return res.status(400).json({
      success: false,
      error: "Amazon Photosの共有URLを指定してください"
    });

  }

  try {

    const result = await getAmazonPhotos(shareUrl);

    res.json({
      success: true,
      pageTitle: result.title,
      count: result.images.length,
      images: result.images
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});


// 写真一覧ページ
app.get("/gallery", async (req, res) => {

  const shareUrl = req.query.url;
const forceRefresh = req.query.refresh === "1";
  if (!shareUrl) {

    return res.redirect("/");

  }

  try {

   let images;

const cached = galleryCache.get(shareUrl);

if (!forceRefresh && cached && Date.now() - cached.time < CACHE_TIME) {
  images = cached.images;
} else {
  const result = await getAmazonPhotos(shareUrl);
  images = result.images;

  galleryCache.set(shareUrl, {
    time: Date.now(),
    images: images
  });
}
    const photoHtml = images.map((src, index) => `
      <img
        src="${src}"
        class="photo"
        loading="lazy"
        data-index="${index}"
        alt=""
      >
    `).join("");

    const imagesJson = JSON.stringify(images);

    res.send(`
<!DOCTYPE html>
<html lang="ja">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>Amazon Photos 快適ビュー</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  background:#111;
  color:#fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

header{
  position:sticky;
  top:0;
  z-index:20;
  background:rgba(17,17,17,.96);
  padding:12px;
  text-align:center;
  border-bottom:1px solid #333;
}

header h1{
  font-size:17px;
  margin:0;
}

header p{
  font-size:12px;
  color:#bbb;
  margin:5px 0 0;
}

#gallery{
  display:grid;
  grid-template-columns:
    repeat(3,1fr);
  gap:2px;
}

.photo{
  width:100%;
  aspect-ratio:1/1;
  object-fit:cover;
  display:block;
  background:#222;
  cursor:pointer;
}

#viewer{
  display:none;
  position:fixed;
  inset:0;
  z-index:100;
  background:#000;
  align-items:center;
  justify-content:center;
}

#viewer.active{
  display:flex;
}

#viewerImage{
  max-width:100%;
  max-height:100%;
  object-fit:contain;
}

#close{
  position:absolute;
  top:15px;
  left:15px;
  z-index:110;
  width:46px;
  height:46px;
  border-radius:50%;
  border:0;
  background:rgba(0,0,0,.6);
  color:white;
  font-size:27px;
}

.nav{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  width:52px;
  height:70px;
  border:0;
  background:rgba(0,0,0,.45);
  color:#fff;
  font-size:40px;
  border-radius:12px;
}

#prev{
  left:8px;
}

#next{
  right:8px;
}

#counter{
  position:absolute;
  top:22px;
  left:50%;
  transform:translateX(-50%);
  background:rgba(0,0,0,.55);
  padding:6px 12px;
  border-radius:20px;
  font-size:13px;
}

.empty{
  text-align:center;
  padding:50px 20px;
  color:#ccc;
}

</style>

</head>

<body>

<header>

<h1>Amazon Photos 快適ビュー</h1>

<p>
${images.length}枚を読み込みました
</p>

</header>

${
  images.length
  ? `<div id="gallery">${photoHtml}</div>`
  : `<div class="empty">
       写真を取得できませんでした。
     </div>`
}

<div id="viewer">

<button id="close">×</button>

<div id="counter"></div>

<button
  class="nav"
  id="prev"
>‹</button>

<img
  id="viewerImage"
  alt=""
>

<button
  class="nav"
  id="next"
>›</button>

</div>

<script>

const photos = ${imagesJson};

const viewer =
  document.getElementById("viewer");

const viewerImage =
  document.getElementById("viewerImage");

const counter =
  document.getElementById("counter");

let currentIndex = 0;

function showPhoto(index){

  if(!photos.length) return;

  currentIndex = index;

  viewerImage.src =
    photos[currentIndex];

  counter.textContent =
    (currentIndex + 1)
    + " / "
    + photos.length;

}

function openViewer(index){

  showPhoto(index);

  viewer.classList.add("active");

}

function closeViewer(){

  viewer.classList.remove("active");

}

function nextPhoto(){

  currentIndex =
    (currentIndex + 1)
    % photos.length;

  showPhoto(currentIndex);

}

function prevPhoto(){

  currentIndex =
    (currentIndex - 1 + photos.length)
    % photos.length;

  showPhoto(currentIndex);

}

document
  .querySelectorAll(".photo")
  .forEach(img => {

    img.addEventListener(
      "click",
      () => {
        openViewer(
          Number(img.dataset.index)
        );
      }
    );

  });

document
  .getElementById("close")
  .addEventListener(
    "click",
    closeViewer
  );

document
  .getElementById("next")
  .addEventListener(
    "click",
    nextPhoto
  );

document
  .getElementById("prev")
  .addEventListener(
    "click",
    prevPhoto
  );

let startX = 0;

viewer.addEventListener(
  "touchstart",
  e => {

    startX =
      e.changedTouches[0].screenX;

  },
  {passive:true}
);

viewer.addEventListener(
  "touchend",
  e => {

    const endX =
      e.changedTouches[0].screenX;

    if(startX - endX > 50){
      nextPhoto();
    }

    if(endX - startX > 50){
      prevPhoto();
    }

  },
  {passive:true}
);

</script>

</body>

</html>
    `);

  } catch (error) {

    res.status(500).send(`
      <h2>エラーが発生しました</h2>
      <pre>${escapeHtml(error.message)}</pre>
    `);

  }

});


app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(`Server running on port ${PORT}`);
  }
);
