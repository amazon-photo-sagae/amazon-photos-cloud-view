const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Amazon Photos Cloud View server is running!");
});

app.get("/test", async (req, res) => {
  const shareUrl = req.query.url;

  if (!shareUrl) {
    return res.status(400).json({
      success: false,
      error: "Amazon Photosの共有URLを指定してください"
    });
  }

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 }
    });

    // 通信中に見つかった画像を保存
    const networkImages = new Set();

    page.on("response", async (response) => {
      try {
        const contentType =
          (await response.allHeaders())["content-type"] || "";

        if (contentType.startsWith("image/")) {
          networkImages.add(response.url());
        }
      } catch (e) {
        // 読めない通信は無視
      }
    });

    await page.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Amazon Photosが写真を読み込む時間を待つ
    await page.waitForTimeout(10000);

    // 少しスクロールして遅延読み込みを促す
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(1500);
    }

    // ページ内に存在する画像URLも取得
    const pageImages = await page.evaluate(() => {
      return Array.from(document.images)
        .map(img => img.currentSrc || img.src)
        .filter(Boolean);
    });

    // 通信で拾った画像＋ページ内画像を合体
    const allImages = [
      ...new Set([
        ...Array.from(networkImages),
        ...pageImages
      ])
    ];

    const title = await page.title();

    res.json({
      success: true,
      pageTitle: title,
      networkImageCount: networkImages.size,
      pageImageCount: pageImages.length,
      count: allImages.length,
      images: allImages
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
