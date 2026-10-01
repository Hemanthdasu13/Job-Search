// Renders scripts/og-card.html to public/og.png at 1200x630.
//
//   node dev.mjs &            the card's /fonts/ paths come from the server
//   node scripts/make-og.mjs
//
// Loading the site first and then replacing the document is what makes the
// absolute font paths resolve, so the card is set in the same faces as the
// page rather than in whatever the renderer falls back to.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("./og-card.html", import.meta.url), "utf8");
const b = await chromium.launch({ args: ["--disable-background-networking","--no-sandbox"],
  executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
p.on("pageerror", e => console.log("PAGE ERROR:", e.message));
// Load the site first so the base URL is the dev server and the card's
// absolute /fonts/ paths resolve to the real woff2 files.
await p.goto("http://127.0.0.1:3000/", { waitUntil: "load" });
await p.setContent(html, { waitUntil: "load" });
await p.evaluate(() => document.fonts.load('400 104px "Instrument Serif"'));
await p.evaluate(() => document.fonts.ready);
console.log("serif:", await p.evaluate(() => document.fonts.check('400 104px "Instrument Serif"')),
            "mono:", await p.evaluate(() => document.fonts.check('400 19px "IBM Plex Mono"')),
            "h1:", await p.evaluate(() => document.querySelector("h1")?.textContent?.slice(0,20)));
await p.waitForTimeout(400);
await p.screenshot({ path: new URL("../public/og.png", import.meta.url).pathname, clip: { x:0, y:0, width:1200, height:630 } });
await b.close();
