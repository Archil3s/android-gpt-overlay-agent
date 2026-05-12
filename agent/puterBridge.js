const { chromium } = require("playwright");

let browserPromise = null;
let pagePromise = null;

async function chatWithPuter(prompt) {
  const page = await getPage();

  return page.evaluate(async message => {
    if (!window.puter || !window.puter.ai || !window.puter.ai.chat) {
      throw new Error("Puter.js is not available in the browser context");
    }

    const response = await window.puter.ai.chat(message);
    return typeof response === "string" ? response : String(response ?? "");
  }, prompt);
}

async function getPage() {
  if (pagePromise) return pagePromise;

  pagePromise = (async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <script src="https://js.puter.com/v2/"></script>
        </head>
        <body>
          <div id="status">puter bridge</div>
        </body>
      </html>
    `, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => window.puter && window.puter.ai && window.puter.ai.chat, {
      timeout: Number(process.env.PUTER_BRIDGE_TIMEOUT_MS || 60000)
    });

    return page;
  })();

  return pagePromise;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.PUTER_HEADLESS !== "false"
    });
  }

  return browserPromise;
}

async function closePuterBridge() {
  const browser = await browserPromise?.catch(() => null);
  await browser?.close();
  browserPromise = null;
  pagePromise = null;
}

module.exports = {
  chatWithPuter,
  closePuterBridge
};
