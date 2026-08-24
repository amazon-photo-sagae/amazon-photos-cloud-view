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

    await page.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // 写真が読み込まれる時間を少し待つ
    await page.waitForTimeout(5000);

    // ページ内にある画像を調べる
    const images = await page.evaluate(() => {
      return Array.from(document.images)
        .map(img => ({
          src: img.currentSrc || img.src,
          alt: img.alt || "",
          width: img.naturalWidth,
          height: img.naturalHeight
        }))
        .filter(img =>
          img.src &&
          img.width >= 100 &&
          img.height >= 100
        )
        .slice(0, 20);
    });

    res.json({
      success: true,
      pageTitle: await page.title(),
      count: images.length,
      images: images
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
