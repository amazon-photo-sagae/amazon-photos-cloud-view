const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// トップページ
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amazon Photos 快適ビュー</title>
<style>
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  max-width:700px;
  margin:0 auto;
  padding:40px 20px;
  background:#111;
  color:#fff;
}
h1{font-size:26px;}
p{line-height:1.7;color:#ccc;}
input{
  width:100%;
  box-sizing:border-box;
  padding:15px;
  font-size:16px;
  border-radius:10px;
  border:1px solid #555;
  margin:15px 0;
}
button{
  width:100%;
  padding:16px;
  border:0;
  border-radius:10px;
  font-size:17px;
  font-weight:bold;
  cursor:pointer;
}
</style>
</head>
<body>

<h1>Amazon Photos 快適ビュー</h1>

<p>
Amazon Photosの共有URLを貼り付けると、
写真をスマホで見やすい一覧にします。
</p>

<form action="/gallery" method="GET">
<input
  type="url"
  name="url"
  placeholder="Amazon Photosの共有URL"
  required
>
<button type="submit">写真を見る</button>
</form>

</body>
</html>
  `);
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

    // 下へ少しずつスクロールして
    // Amazon Photosに写真を読み込ませる
    for (let i = 0; i < 12; i++) {

      await page.mouse.wheel(0, 1200);

      await page.waitForTimeout(1000);

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

  if (!shareUrl) {

    return res.redirect("/");

  }

  try {

    const result = await getAmazonPhotos(shareUrl);

    const images = result.images;

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
