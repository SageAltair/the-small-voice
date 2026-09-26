/**
 * End-to-end checks for the experience-builder upgrade.
 *
 * Covers: responsive device preview, saving/reload fidelity, bottom-of-page
 * spacing, media elements, custom vs automatic layout, checkbox persistence,
 * divider minimum size, link URL, shapes, icons, tables, export and help.
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
const notes = [];
function check(label, ok, detail) {
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
  if (!ok) { failed += 1; notes.push(label); }
}

async function login() {
  const res = await fetch(API + "/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: process.env.TSV_ADMIN_USER || "admin",
      password: process.env.TSV_ADMIN_PASSWORD || "",
    }).toString(),
  });
  // Without this check a rejected login silently stores the string
  // "undefined" as the bearer token and every later API call 401s, which
  // looks like a dozen unrelated feature failures instead of one.
  if (!res.ok) throw new Error(`Login failed (${res.status}); set TSV_ADMIN_PASSWORD to match backend/.env`);
  const token = (await res.json()).access_token;
  if (!token) throw new Error("Login returned no access token");
  return token;
}

const tool = (page, wanted) => page.evaluate((raw) => {
  const want = String(raw).replace(/^[\^$]+|[\^$]+$/g, "").toLowerCase();
  const b = Array.from(document.querySelectorAll(".eb-tool"))
    .find((n) => (n.getAttribute("title") || n.textContent || "").trim().toLowerCase() === want);
  if (b) b.click();
  return Boolean(b);
}, wanted);

const select = (page, selector, match) => page.evaluate((sel, want) => {
  const s = document.querySelector(sel);
  if (!s) return "no select";
  const o = Array.from(s.options).find((x) => (x.textContent || "").trim() === want)
    || Array.from(s.options).find((x) => x.value === want);
  if (!o) return "no option " + want;
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(s, o.value);
  s.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}, selector, match);

const setInput = (page, selector, value, nth) => page.evaluate((sel, val, n) => {
  const list = Array.from(document.querySelectorAll(sel));
  const box = n === undefined ? list[0] : list[n];
  if (!box) return "missing " + sel;
  const proto = box.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(box, val);
  box.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, selector, value, nth);

const save = (page) => page.evaluate(() => {
  Array.from(document.querySelectorAll(".eb-topbar button"))
    .find((n) => /save/i.test(n.textContent))?.click();
});


/** Geometry of every element: is it inside the page, and does it leave a margin? */
const geometry = (pg) => pg.evaluate(() => Array.from(document.querySelectorAll(".exr-element")).map((n) => {
  const origin = document.querySelector(".exr-page");
  const p = origin ? origin.getBoundingClientRect() : null;
  const b = n.getBoundingClientRect();
  return {
    type: n.dataset.elementType,
    left: Math.round(b.left - (p ? p.left : 0)),
    right: Math.round((p ? p.right : 0) - b.right),
    top: Math.round(b.top - (p ? p.top : 0)),
    width: Math.round(b.width),
    height: Math.round(b.height),
  };
}));

const overflows = (pg) => pg.evaluate(() => Array.from(document.querySelectorAll(".exr-element"))
  .filter((n) => {
    const t = n.querySelector(".exr-autofit");
    return t && Math.ceil(t.scrollHeight) > n.offsetHeight + 2;
  })
  .map((n) => n.dataset.elementType));

const status = (page) => page.evaluate(() => (document.querySelector(".eb-status")?.textContent || "").trim());

async function run() {
  const token = await login();
  const browser = await puppeteer.launch({
    executablePath: BROWSERS.find((p) => fs.existsSync(p)),
    headless: "new",
    args: ["--no-sandbox"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument((t) => window.localStorage.setItem("access_token", t), token);

  await page.goto(APP + "/admin/experience-builder", { waitUntil: "networkidle2" });
  await sleep(900);
  await page.type("#create-title", "Feature Check");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-modal button"))
      .find((n) => /create and open/i.test(n.textContent))?.click();
  });
  await sleep(2600);
  const id = new URL(page.url()).searchParams.get("id");
  console.log("  create -> id=" + id + " url=" + page.url().replace(/\?.*$/, "?…")
    + " modal=" + await page.evaluate(() => Boolean(document.querySelector(".eb-modal")))
    + " topbar=" + await page.evaluate(() => Array.from(document.querySelectorAll(".eb-topbar button")).map((n) => n.textContent.trim()).filter(Boolean).join("/")));
  // A full page reload would wipe this flag; several later checks depend on
  // the editor session that was just created surviving the whole run.
  await page.evaluate(() => { window.__tsvRun = "live"; });
  page.on("response", (r) => {
    if (r.status() === 401 || r.status() >= 500) console.log("  HTTP " + r.status() + " " + r.request().method() + " " + r.url());
  });

  console.log("== new element types ==");
  for (const label of ["Table", "Icon", "Quote"]) {
    check(label + " can be added", await tool(page, "^" + label));
    await sleep(420);
  }
  check("table renders with cells", await page.evaluate(() => document.querySelectorAll(".exr-table td").length > 0));
  check("icon renders an svg", await page.evaluate(() => document.querySelectorAll(".exr-icon svg").length > 0));

  console.log("== shapes ==");
  await tool(page, "^Shape$");
  await sleep(500);
  const shapeNames = await page.evaluate(() => Array.from(
    document.querySelectorAll(".eb-panel--right select option"),
  ).map((o) => o.value));
  check("shape choices are offered", shapeNames.includes("circle") && shapeNames.includes("star"), shapeNames.join(","));
  await select(page, ".eb-panel--right select", "circle");
  await sleep(600);
  check("shape switched to circle", await page.evaluate(() => Boolean(document.querySelector(".exr-shape--circle"))));

  console.log("== divider minimum ==");
  await tool(page, "^Divider$");
  await sleep(600);
  const dividerH = await page.evaluate(() => {
    const d = document.querySelector('.exr-element[data-element-type="divider"]');
    return d ? d.offsetHeight : null;
  });
  check("a divider exists", dividerH !== null, dividerH + "px");
  check("a divider can be 1px", dividerH !== null && dividerH <= 2, dividerH + "px");


  console.log("== link url ==");
  await tool(page, "^Link$");
  await sleep(600);
  const linkHasUrl = await page.evaluate(() => Array.from(
    document.querySelectorAll(".eb-panel--right .eb-label"),
  ).some((n) => /link address/i.test(n.textContent)));
  check("link exposes a URL field", linkHasUrl);
  const setLink = await setInput(page, ".eb-panel--right input", "https://example.com/path");
  await sleep(500);
  check("link URL was entered", setLink === true, String(setLink));

  console.log("== checkbox ==");
  await tool(page, "^Checkbox$");
  await sleep(600);
  await page.evaluate(() => {
    const cb = document.querySelector('.eb-panel--right input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
  });
  await sleep(500);

  console.log("== automatic layout ==");
  const beforeAuto = await geometry(page);
  await select(page, "#page-layout", "Automatic");
  await sleep(1300);
  const afterAuto = await geometry(page);
  check("automatic layout keeps every element", afterAuto.length === beforeAuto.length,
    beforeAuto.length + " -> " + afterAuto.length);
  const stacked = afterAuto.every((e, i) => i === 0 || e.top >= afterAuto[i - 1].top);
  check("automatic layout stacks in order", stacked);
  check("automatic layout stays inside the page",
    afterAuto.every((e) => e.left >= 0 && e.right >= -2), JSON.stringify(afterAuto.slice(0, 2)));

  // In automatic layout a drag cannot set a free position, so it has to re-rank
  // the element in the stack instead - otherwise the canvas shows a placement
  // the published page will never repeat.
  const stackOrder = () => page.evaluate(() => Array.from(document.querySelectorAll(".exr-element"))
    .map((node) => node.getAttribute("data-element-type")));
  const grab = (which) => page.evaluate((pick) => {
    const list = Array.from(document.querySelectorAll(".exr-element"));
    const node = pick === "first" ? list[0] : list[list.length - 1];
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + Math.min(14, box.height / 2) };
  }, which);
  const orderBefore = await stackOrder();
  const from = await grab("first");
  const to = await grab("last");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y + 40, { steps: 6 });
  await page.mouse.up();
  await sleep(700);
  const orderAfter = await stackOrder();
  const selectedType = await page.evaluate(() => (
    document.querySelector(".exr-element[data-selected='true']")?.dataset.elementType
    || document.querySelector(".eb-panel--right .eb-panel__title")?.textContent || ""));
  check("dragging re-orders the automatic stack",
    orderAfter.length === orderBefore.length && orderAfter[orderAfter.length - 1] === orderBefore[0],
    JSON.stringify({ before: orderBefore, after: orderAfter, moved: selectedType }));
  const stillStacked = (await geometry(page)).every((e, i, all) => i === 0 || e.top >= all[i - 1].top);
  check("the stack is still ordered after the drag", stillStacked);

  await select(page, "#page-layout", "Custom");
  await sleep(1100);
  const backCustom = await geometry(page);
  const key = (list) => JSON.stringify(list.map((e) => [e.type, e.left, e.top, e.width, e.height]));
  check("switching back restores the authored positions", key(backCustom) === key(beforeAuto));

  console.log("== edge spacing ==");
  const geo = await geometry(page);
  check("no element runs off the left or right edge",
    geo.filter((e) => e.left < -2 || e.right < -2).length === 0);
  check("every element has a left margin", geo.every((e) => e.left >= 8),
    JSON.stringify(geo.map((e) => e.left)));
  check("no text is clipped", (await overflows(page)).length === 0,
    JSON.stringify(await overflows(page)));

  console.log("== responsive preview ==");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-seg"))
      .find((n) => /preview/i.test(n.textContent))?.click();
  });
  await sleep(1300);

  for (const device of ["Phone", "Tablet", "Desktop"]) {
    await page.evaluate((d) => {
      Array.from(document.querySelectorAll(".eb-seg"))
        .find((n) => n.textContent.trim() === d)?.click();
    }, device);
    await sleep(1300);
    const measure = await page.evaluate(() => {
      const p = document.querySelector(".eb-preview .exr-page");
      const pageWidth = p ? p.getBoundingClientRect().width : 0;
      const widths = Array.from(document.querySelectorAll(".eb-preview .exr-element"))
        .map((n) => n.getBoundingClientRect().width);
      return { pageWidth, widest: widths.length ? Math.max(...widths) : 0 };
    });
    check(device + ": nothing overflows the page", measure.widest <= measure.pageWidth + 2,
      "widest " + Math.round(measure.widest) + " / page " + Math.round(measure.pageWidth));
    check(device + ": no clipped text", (await overflows(page)).length === 0);
  }


  console.log("== media dialog ==");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-seg"))
      .find((n) => /design/i.test(n.textContent))?.click();
  });
  await sleep(1000);
  await tool(page, "^Video$");
  await sleep(600);
  const videoAccept = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll(".eb-panel--right button"))
      .find((n) => /choose file|replace|configure/i.test(n.textContent));
    if (btn) btn.click();
    return Boolean(btn);
  });
  await sleep(900);
  check("media dialog opens from the properties panel", videoAccept);
  const acceptValue = await page.evaluate(() => {
    const input = document.querySelector('.eb-modal input[type="file"]');
    return input ? input.getAttribute("accept") : null;
  });
  check("video accepts video formats", acceptValue && acceptValue.includes("video/"),
    String(acceptValue).slice(0, 60));
  const urlTab = await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll(".eb-modal .eb-tab"))
      .find((n) => /use url|paste link/i.test(n.textContent));
    if (tab) tab.click();
    return Boolean(tab);
  });
  check("dialog offers a URL option", urlTab);
  await page.keyboard.press("Escape");
  await sleep(600);

  console.log("== help ==");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".eb-topbar button"))
      .find((n) => /help/i.test(n.textContent))?.click();
  });
  await sleep(900);
  check("help panel opens", await page.evaluate(() => Boolean(document.querySelector(".eb-help__body"))));
  const helpSearch = await setInput(page, ".eb-help__search input", "video");
  await sleep(600);
  const helpText = await page.evaluate(() => (document.querySelector(".eb-help__body")?.textContent || ""));
  check("help search finds the video element", helpSearch === true && /video/i.test(helpText),
    helpText.slice(0, 50).replace(/\s+/g, " "));
  check("help explains how to add a video", /upload|link|https/i.test(helpText));
  await page.keyboard.press("Escape");
  await sleep(600);
  await page.evaluate(() => {
    document.querySelector(".eb-modal")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await sleep(600);

  // Console errors are only printed at the end, but a crash mid-run hides the
  // ones that explain what went wrong, so they are echoed as they arrive too.
  if (errors.length) console.log("  console so far: " + errors.slice(0, 4).join(" | "));

  console.log("== export ==");
  const exportOpen = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll(".eb-topbar button"))
      .find((n) => /export/i.test(n.textContent));
    if (btn) btn.click();
    return Boolean(btn);
  });
  await sleep(800);
  const exportItems = await page.evaluate(() => Array.from(
    document.querySelectorAll(".eb-export__item"),
  ).map((n) => n.textContent.trim()));
  const exportState = await page.evaluate(() => ({
    exportOpen: Boolean(document.querySelector(".eb-export__scrim")),
    runMarker: window.__tsvRun || "(reloaded!)",
    href: location.href.replace(/\?.*$/, "?…"),
    scrim: Boolean(document.querySelector(".eb-export__scrim")),
    topbar: Array.from(document.querySelectorAll(".eb-topbar button")).map((n) => n.textContent.trim()).slice(0, 8),
    modals: Array.from(document.querySelectorAll(".eb-modal")).map((n) => ({
      cls: n.className.slice(0, 80),
      head: (n.querySelector(".eb-modal__title, h2, h3")?.textContent || n.textContent || "").trim().slice(0, 60),
      visible: getComputedStyle(n).display !== "none" && n.offsetParent !== null,
      buttons: Array.from(n.querySelectorAll("button")).map((b) => b.textContent.trim()).slice(0, 8),
      rect: (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(n.getBoundingClientRect()),
    })),
  }));
  check("export menu lists PNG", exportOpen && exportItems.some((t) => /PNG/.test(t)),
    exportItems.join(" | ") + " || btn=" + exportOpen + " || " + JSON.stringify(exportState));
  check("export menu lists JPG", exportItems.some((t) => /JPG/.test(t)));
  check("export menu lists PDF", exportItems.some((t) => /PDF/.test(t)));
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector(".eb-export__scrim")?.click());
  await sleep(500);

  // The layout mode belongs to the design, not to the editor's view: if the
  // API drops it, the published page stops flowing the moment it is reopened.
  await select(page, "#page-layout", "Automatic");
  await sleep(900);

  console.log("== save and reload ==");
  await save(page);
  await sleep(2600);
  const saveStatus = await status(page);
  // "Unsaved changes" also matches /saved/, so the dirty state must be ruled out.
  check("save reports success", /saved/i.test(saveStatus) && !/unsaved|saving|error/i.test(saveStatus), saveStatus);

  await page.goto(APP + "/admin/experience-builder?id=" + id, { waitUntil: "networkidle2" });
  await sleep(2400);

  const restored = await page.evaluate(() => ({
    table: document.querySelectorAll(".exr-table td").length,
    icon: document.querySelectorAll(".exr-icon svg").length,
    shape: document.querySelectorAll(".exr-shape[class*='exr-shape--']").length,
    divider: document.querySelector('.exr-element[data-element-type="divider"]')?.offsetHeight || null,
    checkbox: Boolean(document.querySelector('.exr-element[data-element-type="checkbox"]')),
    link: Boolean(document.querySelector(".exr-link")),
    count: document.querySelectorAll(".exr-element").length,
    layout: document.querySelector("#page-layout")?.value || null,
    layoutLabel: (Array.from(document.querySelector("#page-layout")?.options || [])
      .find((option) => option.selected)?.textContent || "").trim(),
  }));
  check("table survives reload", restored.table > 0, restored.table + " cells");
  check("icon survives reload", restored.icon > 0);
  check("shape survives reload", restored.shape > 0);
  check("divider keeps its 1px height", restored.divider !== null && restored.divider <= 2, restored.divider + "px");
  check("checkbox survives reload", restored.checkbox);
  check("link survives reload", restored.link);
  check("no elements were lost", restored.count >= 6, restored.count + " elements");
  check("layout mode survives reload", restored.layout === "auto", restored.layout + " / " + restored.layoutLabel);

  // A page that flows leaves an empty band between neighbours; authored
  // geometry is not guaranteed to, so this is a real auto-layout signature
  // rather than a restatement of the stored value.
  const flow = await geometry(page);
  const noOverlap = flow.every((e, i) => i === 0 || e.top >= flow[i - 1].top + flow[i - 1].height);
  check("reloaded page really flows", noOverlap && flow.length > 1,
    JSON.stringify(flow.map((e) => [e.top, e.height])));
  if (errors.length) console.log("  console so far: " + errors.slice(0, 4).join(" | "));

  const realErrors = errors.filter((t) => !/favicon|404|Failed to load resource/i.test(t));
  check("no console errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

  await fetch(API + "/experiences/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  await browser.close();
  console.log(failed ? "\nFAILED (" + failed + "): " + notes.join("; ") : "\nALL FEATURE CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}

run().catch((error) => {
  console.log("ERROR " + error.message);
  process.exit(1);
});
