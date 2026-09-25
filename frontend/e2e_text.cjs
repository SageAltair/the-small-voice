/**
 * Text and element layout checks.
 *
 * Guards the bugs this round fixed: headings and paragraphs cut off, buttons
 * not filling their frame, text clipped at other page sizes, and text that
 * does not survive save/reload.
 */
const fs = require("fs");
const puppeteer = require("puppeteer-core");

const APP = "http://localhost:5173";
const API = "http://127.0.0.1:8000";
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(label, ok, detail) {
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
  if (!ok) failed += 1;
}

// Deliberately long: at the default body size this needs several more lines
// than the default 140px box, so the box MUST grow for the test to pass.
const LONG = "God wants you to know Him personally, and to walk with Him every "
  + "single day of your life. This passage is intentionally long so the box "
  + "has to grow and wrap rather than cut the sentence off part way through. "
  + "There is more to say here as well, because a small voice needs room to "
  + "speak, and a reader needs room to breathe before the next section begins. "
  + "So this paragraph keeps going until it is certain the frame has been "
  + "asked to make itself taller than anybody expected it to be today.";

async function login() {
  const res = await fetch(API + "/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: process.env.TSV_ADMIN_USER || "admin",
      password: process.env.TSV_ADMIN_PASSWORD || "",
    }).toString(),
  });
  return (await res.json()).access_token;
}

/**
 * Report any element whose text does not fit inside its own frame.
 *
 * `scrollHeight`/`scrollWidth`/`offsetHeight` are LAYOUT pixels and ignore the
 * canvas zoom transform, so they are compared directly. Only
 * `getBoundingClientRect()` values (screen pixels) need dividing by the scale.
 */
const overflowReport = () =>
  Array.from(document.querySelectorAll(".exr-element"))
    .map((n) => {
      const text = n.querySelector(".exr-autofit");
      if (!text) return null;
      return {
        type: n.dataset.elementType,
        textH: Math.ceil(text.scrollHeight),
        boxH: n.offsetHeight,
        textW: Math.ceil(text.scrollWidth),
        boxW: n.offsetWidth,
      };
    })
    .filter(Boolean);

const clickTool = (page, re) => page.evaluate((src) => {
  Array.from(document.querySelectorAll(".eb-tool"))
    .find((n) => new RegExp(src, "i").test(n.textContent))?.click();
}, re);

const setLongText = (page) => page.evaluate((text) => {
  // The properties panel shows the selected element, so make sure the
  // paragraph is the one being edited before typing into its text field.
  const para = Array.from(document.querySelectorAll(".exr-element"))
    .find((n) => n.dataset.elementType === "text");
  if (para) para.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 }));
  const box = Array.from(document.querySelectorAll(".eb-panel--right textarea, .eb-panel--right input[type=text]"))
    .find((n) => n.value && n.value.length > 20);
  if (!box) return "no text field (fields: "
    + Array.from(document.querySelectorAll(".eb-panel--right textarea, .eb-panel--right input"))
      .map((n) => n.tagName + ":" + String(n.value).slice(0, 12)).join(" | ") + ")";
  const proto = box.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(box, text);
  box.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, LONG);

const setPreset = (page, name) => page.evaluate((label) => {
  const sel = document.querySelector(".eb-panel select");
  if (!sel) return false;
  const opt = Array.from(sel.options).find((o) => o.textContent.trim() === label);
  if (!opt) return false;
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}, name);

const buttonFill = (page) => page.evaluate(() => {
  const el = Array.from(document.querySelectorAll(".exr-element"))
    .find((n) => n.dataset.elementType === "button");
  if (!el) return null;
  const b = el.querySelector(".exr-button");
  const eb = el.getBoundingClientRect();
  const bb = b.getBoundingClientRect();
  return {
    dw: Math.round(eb.width - bb.width),
    dh: Math.round(eb.height - bb.height),
    minH: Math.round(bb.height),
  };
});

const readParagraphText = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll(".exr-element"))
    .filter((n) => n.dataset.elementType === "text")
    .map((n) => n.querySelector(".exr-autofit").textContent));

const clickSave = (page) => page.evaluate(() => {
  Array.from(document.querySelectorAll(".eb-topbar button"))
    .find((n) => /save/i.test(n.textContent))?.click();
});


(async () => {
  const token = await login();
  const browser = await puppeteer.launch({
    executablePath: BROWSERS.find((p) => fs.existsSync(p)),
    headless: "new",
    args: ["--no-sandbox"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => window.localStorage.setItem("access_token", t), token);

  await page.goto(APP + "/admin/experience-builder", { waitUntil: "networkidle2" });
  await sleep(900);
  await page.type("#create-title", "Text Layout");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-modal button"))
      .find((n) => /create and open/i.test(n.textContent))?.click();
  });
  await sleep(2600);

  // Insert the paragraph LAST so it is the selected element and its text
  // field is the one showing in the properties panel.
  for (const label of ["heading", "button", "paragraph"]) {
    await clickTool(page, label);
    await sleep(450);
  }
  await sleep(600);

  const typed = await setLongText(page);
  check("long copy was entered into the paragraph", typed === true, typed === true ? "" : String(typed));
  await sleep(1600);

  const report = await page.evaluate(overflowReport);
  console.log("  measured:", JSON.stringify(report));

  const clippedV = report.filter((r) => r.textH > r.boxH + 2);
  const clippedH = report.filter((r) => r.textW > r.boxW + 2);
  check("no text is taller than its box", clippedV.length === 0, JSON.stringify(clippedV));
  check("no text is wider than its box", clippedH.length === 0, JSON.stringify(clippedH));

  const para = report.find((r) => r.type === "text");
  check("paragraph text fits its box", Boolean(para) && para.textH <= para.boxH + 2,
    para ? para.textH + " in " + para.boxH : "missing");
  check("the box actually grew to fit the copy", Boolean(para) && para.boxH > 140,
    para ? "height " + para.boxH + "px (default was 140)" : "missing");

  const fill = await buttonFill(page);
  check("button fills its element box",
    fill && Math.abs(fill.dw) <= 2 && Math.abs(fill.dh) <= 2,
    fill ? JSON.stringify(fill) : "no button");
  check("button keeps a usable touch target", fill && fill.minH >= 40, fill ? fill.minH + "px" : "");

  console.log("== other page sizes ==");
  for (const preset of ["Mobile", "Desktop"]) {
    await setPreset(page, preset);
    await sleep(1400);
    const r = await page.evaluate(overflowReport);
    const bad = r.filter((x) => x.textH > x.boxH + 2 || x.textW > x.boxW + 2);
    check("no clipping at " + preset, bad.length === 0, JSON.stringify(bad));
  }

  console.log("== persistence ==");
  const before = await readParagraphText(page);
  const id = new URL(page.url()).searchParams.get("id");
  await clickSave(page);
  await sleep(2500);
  await page.goto(APP + "/admin/experience-builder?id=" + id, { waitUntil: "networkidle2" });
  await sleep(2200);

  const after = await readParagraphText(page);
  check("long text is intact after save + reload",
    JSON.stringify(after) === JSON.stringify(before) && String(after[0] || "").length > 100,
    (after[0] || "").slice(0, 40) + "...");

  const badAfter = (await page.evaluate(overflowReport)).filter((r) => r.textH > r.boxH + 2);
  check("text still fits its box after reload", badAfter.length === 0, JSON.stringify(badAfter));

  await fetch(API + "/experiences/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  await browser.close();
  console.log(failed ? "\nFAILED: " + failed : "\nTEXT LAYOUT OK");
  process.exit(failed ? 1 : 0);
})();
