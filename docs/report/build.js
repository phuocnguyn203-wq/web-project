// Renders report.html + info.json into docs/BaoCao-LectureCards.pdf.
// Run from the repo root: node docs/report/build.js   (needs `npm i -D playwright && npx playwright install chromium`)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const dir = __dirname;
const info = JSON.parse(fs.readFileSync(path.join(dir, "info.json"), "utf8"));
const now = new Date();
const missing = [];
const fill = (key, value) => {
  if (value) return value;
  missing.push(key);
  return `<span class="todo">chưa điền: ${key} (docs/report/info.json)</span>`;
};

const total = Object.values(info.contributions).reduce((a, b) => a + b, 0);
if (total !== 100) throw new Error(`contributions add up to ${total}%, not 100%`);

let html = fs.readFileSync(path.join(dir, "report.html"), "utf8")
  .replace(/{{c:([^}]+)}}/g, (_, name) => {
    if (!(name in info.contributions)) throw new Error(`no contribution for ${name}`);
    return String(info.contributions[name]);
  })
  .replace("{{c_total}}", String(total))
  .replace("{{day}}", String(now.getDate()).padStart(2, "0"))
  .replace("{{month}}", String(now.getMonth() + 1))
  .replace("{{year}}", String(now.getFullYear()))
  .replace(/{{(\w+)}}/g, (_, key) => fill(key, info[key]));

(async () => {
  const tmp = path.join(dir, ".render.html"); // next to report.html so img/ paths resolve
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + tmp, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(dir, "..", "BaoCao-LectureCards.pdf");
  await page.pdf({
    path: out,
    format: "A4",
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;font:8px sans-serif;color:#6b7385;padding:0 17mm;display:flex;justify-content:space-between">' +
      '<span>LectureCards · Báo cáo đồ án</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log("wrote", path.relative(process.cwd(), out));
  if (missing.length) console.warn("still empty in info.json:", missing.join(", "));
})();
