/**
 * Browser test for the Experience Builder.
 *
 * Drives a real browser against the running dev server to prove the builder
 * actually opens (a blank page is the failure being guarded against), then
 * walks the authoring flow: create, add elements, place them, undo/redo,
 * save, reload and confirm everything survived.
 *
 * Run with:  node e2e_builder_ui.cjs
 */

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const APP = process.env.TSV_APP || "http://localhost:5173";
const API = process.env.TSV_API || "http://127.0.0.1:8000";
const BUILDER = APP + "/admin/experience-builder";

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

const ADMIN = {
  username: process.env.TSV_ADMIN_USER || "admin",
  password: process.env.TSV_ADMIN_PASSWORD || "",
};

const failures = [];
const pageErrors = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
  if (!ok) {
    console.log("        expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
    failures.push(label);
  }
  return ok;
}

function checkTrue(label, actual) {
  return check(label, Boolean(actual), true);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn() {
  const response = await fetch(API + "/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: ADMIN.username, password: ADMIN.password }).toString(),
  });
  const data = await response.json();
  if (!data.access_token) throw new Error("login failed: " + JSON.stringify(data).slice(0, 200));
  return data.access_token;
}

/** Read every element's on-screen geometry, for before/after comparisons. */
const readGeometry = () =>
  Array.from(document.querySelectorAll(".exr-element"))
    .map((node) => {
      const box = node.getBoundingClientRect();
      return {
        type: node.dataset.elementType,
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type));

/** Click the tool-panel entry whose label matches. */
const clickTool = (pattern) =>
  Array.from(document.querySelectorAll(".eb-tool"))
    .find((node) => pattern.test(node.textContent || ""));

/** Click a toolbar button whose label matches. */
const clickTopbar = (pattern) =>
  Array.from(document.querySelectorAll(".eb-topbar button"))
    .find((node) => pattern.test(node.textContent || ""));

/** Read the rendered size of the React root - 0 means a blank page. */
const rootLength = (target) =>
  target.evaluate(() => document.getElementById("root")?.innerHTML.length || 0);


async function run() {
  const executablePath = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    console.log("SKIP  no Chromium browser found");
    return 0;
  }

  const token = await signIn();
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1600,1000"],
    defaultViewport: { width: 1600, height: 1000 },
  });

  const page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push("console: " + message.text());
  });

  try {
    await page.evaluateOnNewDocument((value) => {
      window.localStorage.setItem("access_token", value);
    }, token);

    console.log("== the builder route renders ==");
    await page.goto(BUILDER, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(900);

    checkTrue("root has content (not a blank page)", (await rootLength(page)) > 500);
    checkTrue(
      "builder shell, boot state or create dialog is mounted",
      await page.evaluate(() => Boolean(document.querySelector(".eb-shell, .eb-boot, .eb-modal"))),
    );

    console.log("== the sidebar entry opens the builder ==");
    await page.goto(APP + "/admin", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(700);

    const navFound = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll(".cms-nav button, .cms-nav a"))
        .find((node) => /experience/i.test(node.textContent || ""));
      if (!label) return false;
      label.click();
      return true;
    });
    checkTrue("Experience Builder entry exists in the workspace nav", navFound);
    await sleep(1500);

    checkTrue("clicking it navigates to the builder", page.url().includes("/experience-builder"));
    checkTrue("builder is not blank after navigating from the sidebar", (await rootLength(page)) > 500);

    console.log("== create an experience ==");
    await page.goto(BUILDER, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(800);

    checkTrue(
      "create dialog appears for a new experience",
      await page.evaluate(() => Boolean(document.querySelector(".eb-modal"))),
    );

    await page.type("#create-title", "UI E2E Canvas");
    const created = await page.evaluate(() => {
      const create = Array.from(document.querySelectorAll(".eb-modal button"))
        .find((node) => /create and open builder/i.test(node.textContent || ""));
      if (!create) return false;
      create.click();
      return true;
    });
    checkTrue("create button is clickable", created);
    await sleep(2800);

    checkTrue("URL now carries an experience id", page.url().includes("id="));
    const experienceId = new URL(page.url()).searchParams.get("id");


    console.log("== add elements and place them freely ==");
    const inserted = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll(".eb-tool"))
        .find((node) => /heading/i.test(node.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    });
    checkTrue("heading tool inserts an element", inserted);
    await sleep(800);

    checkTrue(
      "an element is rendered on the canvas",
      await page.evaluate(() => Boolean(document.querySelector(".exr-element"))),
    );

    const moved = await page.evaluate(async () => {
      const node = document.querySelector(".exr-element");
      const outline = node && node.querySelector(".eb-selection__outline");
      if (!outline) return null;

      const start = outline.getBoundingClientRect();
      const before = node.getBoundingClientRect();
      const send = (type, x, y) => outline.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, button: 0, buttons: 1,
      }));

      send("pointerdown", start.x + 20, start.y + 20);
      for (let step = 1; step <= 12; step += 1) {
        send("pointermove", start.x + 20 + step * 10, start.y + 20 + step * 6);
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
      await new Promise((resolve) => setTimeout(resolve, 250));

      const after = node.getBoundingClientRect();
      return { dx: Math.round(after.x - before.x), dy: Math.round(after.y - before.y) };
    });
    checkTrue("dragging the element moved it", moved && (Math.abs(moved.dx) > 4 || Math.abs(moved.dy) > 4));

    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll(".eb-tool"))
        .find((node) => /paragraph/i.test(node.textContent || ""));
      if (button) button.click();
    });
    await sleep(700);

    const positions = await page.evaluate(readGeometry);
    check("two elements are on the canvas", positions.length, 2);
    checkTrue(
      "the second element did not land on top of the first",
      Math.abs(positions[0].x - positions[1].x) > 8 || Math.abs(positions[0].y - positions[1].y) > 8,
    );

    console.log("== undo and redo ==");
    const history = await page.evaluate(async () => {
      const before = document.querySelectorAll(".exr-element").length;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const afterUndo = document.querySelectorAll(".exr-element").length;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const afterRedo = document.querySelectorAll(".exr-element").length;
      return { before, afterUndo, afterRedo };
    });
    check("Ctrl+Z removes the last element", history.afterUndo, history.before - 1);
    check("Ctrl+Shift+Z restores it", history.afterRedo, history.before);

    console.log("== save and reload ==");
    const geometryBefore = await page.evaluate(readGeometry);

    await page.evaluate(() => {
      const save = Array.from(document.querySelectorAll(".eb-topbar button"))
        .find((node) => /save/i.test(node.textContent || ""));
      if (save) save.click();
    });
    await sleep(2800);

    const status = await page.evaluate(() => (document.querySelector(".eb-status")?.textContent || "").trim());
    checkTrue('save indicator reports success (got "' + status + '")', /saved/i.test(status));

    await page.goto(BUILDER + "?id=" + experienceId, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2200);

    check("element geometry survives a reload", await page.evaluate(readGeometry), geometryBefore);

    console.log("== preview mode ==");
    await page.evaluate(() => {
      const preview = Array.from(document.querySelectorAll(".eb-seg"))
        .find((node) => /preview/i.test(node.textContent || ""));
      if (preview) preview.click();
    });
    await sleep(1000);

    const preview = await page.evaluate(() => {
      const canvas = document.querySelector(".exr-page--view");
      return { present: Boolean(canvas), elements: canvas ? canvas.querySelectorAll(".exr-element").length : 0 };
    });
    checkTrue("preview renders the design", preview.present && preview.elements > 0);

    console.log("== cleanup ==");
    const deleted = await fetch(API + "/experiences/" + experienceId, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    checkTrue("test experience deleted", deleted.ok);

    console.log("== console errors ==");
    const realErrors = pageErrors.filter(
      (text) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(text),
    );
    checkTrue("no unexpected console/page errors (" + realErrors.length + ")", realErrors.length === 0);
    realErrors.slice(0, 5).forEach((text) => console.log("        " + text));
  } catch (error) {
    console.log("  ERROR " + error.message);
    failures.push("threw: " + error.message);
  } finally {
    await browser.close();
  }

  console.log();
  if (failures.length) {
    console.log("FAILED (" + failures.length + "):");
    failures.forEach((failure) => console.log("  - " + failure));
    return 1;
  }
  console.log("ALL UI CHECKS PASSED");
  return 0;
}

run().then((code) => process.exit(code));
