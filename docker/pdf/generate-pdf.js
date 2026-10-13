const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const language = process.env.LANGUAGE || "en";
const baseUrl = (process.env.BASE_URL || "http://jekyll:4000/online-cv").replace(/\/$/, "");
const output = process.env.OUTPUT || `/output/liviu-florin-ilie-cv-${language}.pdf`;

if (!/^[a-z]{2}$/.test(language)) {
  throw new Error(`Invalid LANGUAGE value: ${language}`);
}

const pageUrl = `${baseUrl}/${language}/`;

async function openWithRetry(page, attempts = 30) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 15000 });
      return;
    } catch (error) {
      lastError = error;
      console.log(`Waiting for Jekyll (${attempt}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw lastError;
}

(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1600 },
    });

    await openWithRetry(page);
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "screen" });
    // Match the compact two-page Letter export used as the layout reference.
    await page.addStyleTag({
      content: "@page { size: Letter; margin: 40pt 66pt; }",
    });

    await page.pdf({
      path: output,
      format: "Letter",
      scale: 0.51,
      printBackground: true,
      preferCSSPageSize: false,
      tagged: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    console.log(`PDF generated from ${pageUrl}: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
