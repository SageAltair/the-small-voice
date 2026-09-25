/**
 * Drag test using REAL browser input (CDP mouse), not synthetic events.
 *
 * Synthetic dispatchEvent can satisfy a handler that a real user could never
 * reach, so this drives page.mouse the way a person's hand would: press on the
 * element body, move in steps, release.
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

(async () => {
  const login = await fetch(API + "/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: process.env.TSV_ADMIN_USER || "admin",
      password: process.env.TSV_ADMIN_PASSWORD || "",
    }).toString(),
  });
  const token = (await login.json()).access_token;

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
  await page.type("#create-title", "Real Drag Test");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-modal button"))
      .find((n) => /create and open/i.test(n.textContent))?.click();
  });
  await sleep(2600);

  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-tool"))
      .find((n) => /heading/i.test(n.textContent))?.click();
  });
  await sleep(800);

  const box = await page.evaluate(() => {
    const n = document.querySelector(".exr-element");
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, left: n.style.left, top: n.style.top };
  });
  check("element exists on canvas", Boolean(box));

  // Count the raw events the page actually receives during a real drag.
  await page.evaluate(() => {
    window.__ev = { down: 0, move: 0, up: 0, moveOnViewport: 0 };
    const el = document.querySelector(".exr-element");
    el.addEventListener("pointerdown", () => { window.__ev.down += 1; });
    document.addEventListener("pointermove", () => { window.__ev.move += 1; }, true);
    const vp = document.querySelector(".eb-viewport");
    vp.addEventListener("pointermove", () => { window.__ev.moveOnViewport += 1; });
    document.addEventListener("pointerup", () => { window.__ev.up += 1; });
  });

  const sx = box.x + box.w / 2;
  const sy = box.y + box.h / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(sx + i * 14, sy + i * 9);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(400);

  const ev = await page.evaluate(() => window.__ev);
  const dbg = await page.evaluate(() => window.__dbg);
  console.log("  events:", JSON.stringify(ev));
  console.log("  app debug:", JSON.stringify(dbg));

  const after = await page.evaluate(() => {
    const n = document.querySelector(".exr-element");
    const b = n.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), left: n.style.left, top: n.style.top, selected: n.className.includes("is-selected") };
  });

  const movedX = Math.round(after.x - box.x);
  const movedY = Math.round(after.y - box.y);
  check("real-mouse drag moved the element", Math.abs(movedX) > 8 || Math.abs(movedY) > 8,
    "dx=" + movedX + " dy=" + movedY);
  check("the element is selected after dragging", after.selected);
  check("it stayed where it was dropped (model matches screen)",
    after.left !== box.left || after.top !== box.top,
    "left " + box.left + " -> " + after.left + ", top " + box.top + " -> " + after.top);

  // A second element must not be disturbed by the first one's drag.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-tool"))
      .find((n) => /paragraph/i.test(n.textContent))?.click();
  });
  await sleep(600);
  const two = await page.evaluate(() => Array.from(document.querySelectorAll(".exr-element")).map((n) => {
    const b = n.getBoundingClientRect();
    return { t: n.dataset.elementType, x: Math.round(b.x), y: Math.round(b.y) };
  }));
  check("both elements present after drag", two.length === 2);
  check("dragged element kept its position", Math.abs(two[0].x - after.x) < 14 || Math.abs(two[0].y - after.y) < 14);

  // Drag the new one with a real mouse as well.
  const p = two[1];
  await page.mouse.move(p.x + 100, p.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(p.x + 100 - i * 10, p.y + 20 + i * 12);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(350);
  const final = await page.evaluate(() => Array.from(document.querySelectorAll(".exr-element")).map((n) => {
    const b = n.getBoundingClientRect();
    return { t: n.dataset.elementType, x: Math.round(b.x), y: Math.round(b.y) };
  }));
  check("second element also drags freely",
    Math.abs(final[1].x - p.x) > 8 || Math.abs(final[1].y - p.y) > 8,
    "dx=" + (final[1].x - p.x) + " dy=" + (final[1].y - p.y));

  const id = new URL(page.url()).searchParams.get("id");
  await fetch(API + "/experiences/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  console.log("cleaned up", id);
  await browser.close();
  console.log(failed ? "\nFAILED: " + failed : "\nREAL-INPUT DRAG OK");
  process.exit(failed ? 1 : 0);
})();
