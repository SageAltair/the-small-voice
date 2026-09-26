/**
 * Export functional check (run: node e2e_export.cjs, needs dev + API running).
 *
 * The menu listing its items proves nothing; this drives the real download path
 * and inspects the bytes that come out, then captures the print document a PDF
 * export writes so we know it carries the design's stylesheet.
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const APP = "http://localhost:5173";
const API = "http://127.0.0.1:8000";
const OUT = path.join(__dirname, "export-out");
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
};

async function login() {
  const res = await fetch(API + "/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: process.env.TSV_ADMIN_USER || "admin",
      password: process.env.TSV_ADMIN_PASSWORD || "",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}); set TSV_ADMIN_PASSWORD to match backend/.env`);
  return (await res.json()).access_token;
}

async function waitForDownload(dir, extension, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const found = fs.readdirSync(dir).find((file) => file.toLowerCase().endsWith(extension));
    if (found) {
      const full = path.join(dir, found);
      // A download still in flight grows; wait for the size to settle.
      let size = -1;
      while (fs.existsSync(full)) {
        const now = fs.statSync(full).size;
        if (now > 0 && now === size) return full;
        size = now;
        await sleep(250);
      }
    }
    await sleep(250);
  }
  return null;
}

const exportItem = (page, label) => page.evaluate((want) => {
  const b = Array.from(document.querySelectorAll(".eb-export__item"))
    .find((n) => n.textContent.trim().toUpperCase().startsWith(want));
  if (b) b.click();
  return Boolean(b);
}, label);

const openExport = (page) => page.evaluate(async () => {
  // The menu is a toggle, so close whatever is open before opening it again.
  document.querySelector(".eb-export__scrim")?.click();
  await new Promise((r) => setTimeout(r, 60));
  Array.from(document.querySelectorAll(".eb-topbar button"))
    .find((b) => /export/i.test(b.textContent))?.click();
});

const exportError = (page) => page.evaluate(() => (document.querySelector(".eb-export__error")?.textContent || "").trim());

const addElement = (page, label) => page.evaluate((want) => {
  const b = Array.from(document.querySelectorAll(".eb-tool"))
    .find((n) => (n.getAttribute("title") || "").trim().toLowerCase() === want.toLowerCase());
  if (b) b.click();
}, label);


async function run() {
  const token = await login();
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: BROWSERS.find((p) => fs.existsSync(p)),
    headless: "new",
    args: ["--no-sandbox"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));

  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: OUT });

  await page.evaluateOnNewDocument((t) => window.localStorage.setItem("access_token", t), token);
  // Capture the print document instead of opening a second window, and record
  // that print() was reached - a real print dialog cannot be observed headless.
  await page.evaluateOnNewDocument(() => {
    window.__printDoc = "";
    window.__printed = false;
    const fake = {
      document: { open() {}, write(html) { window.__printDoc += html; }, close() {} },
      focus() {},
      print() { window.__printed = true; },
      close() {},
      addEventListener() {},
    };
    window.open = () => fake;
  });

  await page.goto(APP + "/admin/experience-builder", { waitUntil: "networkidle2" });
  await sleep(1200);
  await page.type("#create-title", "Export Check");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-modal button"))
      .find((n) => /create and open builder/i.test(n.textContent))?.click();
  });
  await sleep(2600);

  for (const label of ["Heading", "Table", "Shape", "Quote"]) {
    await addElement(page, label);
    await sleep(420);
  }

  console.log("== png ==");
  await openExport(page);
  await sleep(300);
  check("PNG item present", await exportItem(page, "PNG"));
  await sleep(2500);
  const png = await waitForDownload(OUT, ".png");
  check("a PNG file was written", Boolean(png), png && path.basename(png));
  check("PNG reported no error", (await exportError(page)) === "", await exportError(page));
  if (png) {
    const buf = fs.readFileSync(png);
    check("bytes are a real PNG", buf[0] === 0x89 && buf.subarray(1, 4).toString("ascii") === "PNG");
    check("PNG carries the full page size", buf.readUInt32BE(16) > 300 && buf.readUInt32BE(20) > 300,
      { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
    check("PNG is not a blank canvas", buf.length > 4000, `${buf.length} bytes`);
  }

  console.log("== jpg ==");
  await openExport(page);
  await sleep(300);
  check("JPG item present", await exportItem(page, "JPG"));
  await sleep(2500);
  const jpg = await waitForDownload(OUT, ".jpg");
  check("a JPG file was written", Boolean(jpg), jpg && path.basename(jpg));
  if (jpg) {
    const buf = fs.readFileSync(jpg);
    check("bytes are a real JPEG", buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff);
    check("JPG is not a blank canvas", buf.length > 3000, `${buf.length} bytes`);
  }

  console.log("== json ==");
  await openExport(page);
  await sleep(300);
  check("JSON item present", await exportItem(page, "DESIGN"));
  await sleep(2000);
  const jsonFile = await waitForDownload(OUT, ".json");
  check("a design file was written", Boolean(jsonFile), jsonFile && path.basename(jsonFile));
  if (jsonFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
      check("design file holds the elements", Array.isArray(parsed.elements) && parsed.elements.length >= 4,
        parsed.elements ? parsed.elements.length : null);
    } catch (err) {
      check("design file holds the elements", false, err.message);
    }
  }

  console.log("== pdf ==");
  await openExport(page);
  await sleep(300);
  check("PDF item present", await exportItem(page, "PDF"));
  await sleep(2500);
  const printed = await page.evaluate(() => ({ html: window.__printDoc, printed: window.__printed }));
  check("print document was written", printed.html.length > 1000, `${printed.html.length} chars`);
  check("print document carries the design markup", /exr-page/.test(printed.html) && /exr-element/.test(printed.html));
  check("print document carries the stylesheet", /\.exr-[a-z-]+\s*\{/.test(printed.html));
  check("print document sets the page box", /@page\{size:\s*\d+px\s+\d+px/.test(printed.html));

  const menuError = await page.evaluate(() => (document.querySelector(".eb-export__error")?.textContent || "").trim());
  check("no export error was shown", menuError === "", menuError);
  check("no console errors", errors.length === 0, errors.slice(0, 2).map((e) => e.slice(0, 160)));

  const id = new URL(page.url()).searchParams.get("id");
  if (id) {
    await fetch(`${API}/admin/experiences/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {});
  }
  await browser.close();
  console.log(failures ? `\nFAILED (${failures})` : "\nALL EXPORT CHECKS PASSED");
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.log("ERROR " + e.stack); process.exit(1); });

