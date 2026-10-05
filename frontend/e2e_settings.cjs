/**
 * Settings, in a real browser.
 *
 * The unit tests prove the copy is complete and the page renders. This proves
 * the things only a browser can: that switching the theme repaints the whole
 * document, that a choice survives a reload, that searching moves focus onto
 * the row it found, that the confirmation dialog traps focus and hands it back,
 * and that the layout holds at a phone's width.
 *
 * Run with:  node e2e_settings.cjs
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");


const APP = "http://localhost:4173";
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const SHOTS = path.join(__dirname, "e2e-settings-shots");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The browser test is run from a shell that may be watching the preview server
   as well, which makes it easy to lose track of this script's own output. Every
   line is written to a file as it happens so a run can always be read back. */
const LOG = path.join(__dirname, "e2e-settings.log");

function writeLog(lines) {
  try {
    fs.writeFileSync(LOG, lines.join("\n") + "\n");
  } catch {
    // Nothing to do; the console output is still there.
  }
}

const lines = [];
let failed = 0;
function record(line) {
  console.log(line);
  lines.push(line);
  writeLog(lines);
}

function check(label, ok, detail) {
  record("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
  if (!ok) failed += 1;
}

function findBrowser() {
  /* CHROME_PATH comes first so the test can run on a machine where the browser
     is installed somewhere the hardcoded list does not know about. */
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) {
    if (!fs.existsSync(fromEnv)) {
      throw new Error(`CHROME_PATH points at a file that does not exist: ${fromEnv}`);
    }
    return fromEnv;
  }

  const found = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "No Chrome or Edge found for the browser test. Install one, or set " +
        "CHROME_PATH to the browser executable.",
    );
  }
  return found;
}

/** Serve the production build the same way the deployed site is served. */
function startPreview() {
  return spawn("npx vite preview --port 4173 --strictPort", {
    cwd: __dirname,
    stdio: "ignore",
    shell: true,
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(APP + "/settings");
      if (response.ok) return true;
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }
  return false;
}

/** Click the option in a segmented setting whose label matches exactly. */
async function choose(page, rowId, label) {
  const handles = await page.$$(`[id="${rowId}"] .setting-choice-option`);
  for (const handle of handles) {
    const text = await handle.evaluate((el) => el.textContent.trim());
    if (text === label) return handle.click();
  }
  throw new Error(`No option labelled ${label} in ${rowId}`);
}

/** Read one of the data-* attributes the preferences are written onto. */
const dataset = (page, key) =>
  page.evaluate((name) => document.documentElement.dataset[name], key);

/**
 * Every string the Kiswahili settings screen is allowed to show, read from the
 * copy file itself so this list cannot drift away from what the page ships.
 */
async function swahiliStrings() {
  const { settingsCopy } = await import("./src/i18n/settingsCopy.js");
  const strings = [];

  const walk = (node) => {
    Object.values(node).forEach((value) => {
      if (Array.isArray(value) && value.every((row) => Array.isArray(row))) {
        value.forEach((row) => row.forEach((part) => strings.push(String(part))));
      } else if (value && typeof value === "object") {
        walk(value);
      } else if (typeof value === "string") {
        strings.push(value);
      }
    });
  };

  walk(settingsCopy.sw);

  // The build number is printed from package.json, not from the copy file.
  strings.push(require("./package.json").version);

  return strings;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const allowedCopy = await swahiliStrings();

  const server = startPreview();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    if (!(await waitForServer())) throw new Error("The preview server never started.");

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    record("== the popup ==");
    /* Opened from a real page rather than by visiting the URL, because "you were
       reading something and the gear kept you where you were" is the whole
       reason settings is an overlay. */
    await page.goto(APP + "/", { waitUntil: "networkidle0" });
    check("nothing is covering the home page", (await page.$$(".settings-scrim")).length === 0);

    await page.click(".nav-settings a[href='/settings']");
    await sleep(500);

    check("the gear opens the settings popup", (await page.$$(".settings-scrim")).length === 1);
    check("and the URL says so", page.url().endsWith("/settings"), page.url());
    check(
      "it is announced as a modal dialog",
      await page.$eval(".settings-modal", (el) => el.getAttribute("aria-modal") === "true"),
    );
    check(
      "the page behind it is inert, so a click cannot land on it",
      await page.evaluate(() => document.getElementById("root").hasAttribute("inert")),
    );
    check(
      "and it does not scroll behind the panel",
      (await page.evaluate(() => getComputedStyle(document.body).overflow)) === "hidden",
    );
    check(
      "focus starts inside the panel",
      await page.evaluate(() => Boolean(document.activeElement.closest(".settings-modal"))),
      await page.evaluate(() => document.activeElement.className),
    );
    check(
      "the page underneath is still there",
      await page.evaluate(() => Boolean(document.querySelector("main"))),
    );
    await page.screenshot({ path: path.join(SHOTS, "00-popup.png") });

    record("== structure ==");
    const sections = await page.$$eval(".settings-nav-link", (links) => links.length);
    check("every section is in the sidebar", sections === 14, sections + " links");
    check(
      "the first section is active on load",
      await page.$eval(".settings-nav-link.is-active", (el) => el.textContent.includes("Appearance")),
    );
    check(
      "the content area shows one section heading",
      (await page.$$(".settings-section-heading")).length === 1,
    );
    await page.screenshot({ path: path.join(SHOTS, "01-appearance.png") });

    record("== theme ==");
    await page.goto(APP + "/settings/appearance", { waitUntil: "networkidle0" });
    await choose(page, "appearance.theme", "Dark");
    await sleep(300);
    check("choosing Dark repaints the document", (await dataset(page, "theme")) === "dark");
    await page.screenshot({ path: path.join(SHOTS, "02-dark.png") });

    await page.reload({ waitUntil: "networkidle0" });
    check("the theme survives a reload", (await dataset(page, "theme")) === "dark");

    await choose(page, "appearance.theme", "Light");
    await sleep(200);

    record("== accessibility ==");
    await page.goto(APP + "/settings/accessibility", { waitUntil: "networkidle0" });
    await choose(page, "accessibility.textSize", "Large");
    await sleep(300);
    check("text size reaches the document", (await dataset(page, "textSize")) === "large");
    check(
      "and the whole site is resized with it",
      (await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))) > 17,
    );
    await page.screenshot({ path: path.join(SHOTS, "03-accessibility-large.png") });

    /* Appearance and Accessibility write one value. If they could disagree, one
       of the two pages would be lying to somebody. */
    await page.goto(APP + "/settings/appearance", { waitUntil: "networkidle0" });
    await choose(page, "appearance.motion", "Reduced animations");
    await sleep(250);
    check("motion reaches the document", (await dataset(page, "motion")) === "reduced");
    await page.goto(APP + "/settings/accessibility", { waitUntil: "networkidle0" });
    check(
      "the Accessibility switch agrees with it",
      await page.$eval('[id="accessibility.motion"] input', (el) => el.checked),
    );

    await page.goto(APP + "/settings/reading", { waitUntil: "networkidle0" });
    await choose(page, "reading.width", "Wide");
    await sleep(200);
    check("reading width reaches the document", (await dataset(page, "readingWidth")) === "wide");

    record("== search ==");
    await page.goto(APP + "/settings", { waitUntil: "networkidle0" });
    await page.type("#settings-search", "dark");
    await sleep(250);
    const results = await page.$$eval(".settings-search-group button", (buttons) => buttons.length);
    check("searching dark finds the theme", results > 0, results + " results");
    check("the section steps aside while searching", (await page.$$(".settings-section-heading")).length === 0);
    await page.screenshot({ path: path.join(SHOTS, "04-search.png") });

    await page.click(".settings-search-group button");
    await sleep(400);
    check("picking a result opens its section", page.url().endsWith("/settings/appearance"), page.url());
    check(
      "and moves focus onto the row itself",
      (await page.evaluate(() => document.activeElement.id)) === "appearance.theme",
      await page.evaluate(() => document.activeElement.id),
    );
record("== destructive actions ==");
    await page.goto(APP + "/settings/data", { waitUntil: "networkidle0" });
    await page.click('[id="data.reset"] .button');
    await sleep(250);
    check("a confirmation appears over the popup", (await page.$$(".dialog")).length === 1);
    check(
      "two dialogs are stacked, the settings panel underneath",
      (await page.$$('[role="dialog"]')).length === 2,
    );
    check(
      "the dialog says exactly what is kept",
      (await page.$eval('[role="dialog"] .dialog-keeps', (el) => el.textContent)).includes("does not delete your account"),
    );
    check(
      "focus starts on the dialog, never on the button that destroys things",
      await page.evaluate(
        () => document.activeElement.classList.contains("dialog") &&
          !document.activeElement.classList.contains("danger"),
      ),
      await page.evaluate(() => document.activeElement.className),
    );
    check(
      "and the settings popup behind it is still locked",
      await page.evaluate(() => document.getElementById("root").hasAttribute("inert")),
    );
    await page.screenshot({ path: path.join(SHOTS, "05-confirm.png") });

    await page.keyboard.press("Escape");
    await sleep(300);
    check("Escape closes only the confirmation", (await page.$$(".dialog")).length === 0);
    check(
      "and leaves the settings popup open",
      (await page.$$(".settings-scrim")).length === 1,
    );
    check(
      "with the page still locked behind it",
      await page.evaluate(() => document.getElementById("root").hasAttribute("inert")),
    );
    check(
      "focus goes back to the button that opened it",
      await page.evaluate(() => Boolean(document.activeElement.closest('[id="data.reset"]'))),
      await page.evaluate(() => document.activeElement.textContent.trim()),
    );
    check("a cancelled reset changed nothing", (await dataset(page, "readingWidth")) === "wide");

    await page.click('[id="data.reset"] .button');
    await sleep(200);
    await page.click(".dialog .button.danger");
    await sleep(350);
    check("confirming returns the reading width to its default", (await dataset(page, "readingWidth")) === "default");
    check(
      "and resets the accessibility choices too, which it said it would",
      (await dataset(page, "textSize")) === "default",
    );

    record("== honest states ==");
    await page.goto(APP + "/settings/account", { waitUntil: "networkidle0" });
    const signedOut = await page.$eval(".settings-content", (el) => el.textContent);
    check(
      "a signed-out visitor is invited to sign in rather than shown an empty account",
      signedOut.includes("Sign in") && !signedOut.includes("@"),
    );

    await page.goto(APP + "/settings/about", { waitUntil: "networkidle0" });
    const about = await page.$eval(".settings-content", (el) => el.textContent);
    check(
      "the version is the one in package.json",
      about.includes(require("./package.json").version),
      require("./package.json").version,
    );

    record("== phone ==");
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(APP + "/settings/notifications", { waitUntil: "networkidle0" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("nothing scrolls sideways on a phone", overflow <= 1, overflow + "px");
    const switches = await page.$$eval(".setting-switch-track", (tracks) =>
      tracks.map((track) => Math.round(track.getBoundingClientRect().height)),
    );
    check(
      "every switch is a comfortable touch target",
      switches.length > 0 && switches.every((height) => height >= 24),
      switches.join(",") + "px",
    );

    /* The search box and the section rail both stick to the top of the scrolling
       body. If they ever overlap each other, or either one slides away, a reader
       has to scroll back to the top to change anything - so this scrolls and
       looks. */
    await page.evaluate(() => {
      document.querySelector(".settings-body").scrollTop = 900;
    });
    await sleep(400);
    const stuck = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
      };
      return { search: box(".settings-search"), rail: box(".settings-nav") };
    });
    check(
      "the search box stays put while scrolling",
      stuck.search.top <= 80,
      "top " + stuck.search.top + "px",
    );
    check(
      "the section rail sits directly under it",
      stuck.rail.top === stuck.search.bottom,
      "search ends " + stuck.search.bottom + ", rail starts " + stuck.rail.top,
    );

    /* Content scrolling under a sticky element is expected - that is what sticky
       elements are for, and a bounding box cannot tell covered from visible. What
       can be checked is the two things that actually cause a bleed: the rail
       being transparent, and the rail sitting at the wrong offset so the search
       box and the chips overlap. */
    const railPaint = await page.evaluate(
      () => getComputedStyle(document.querySelector(".settings-nav")).backgroundColor,
    );
    check("the rail has an opaque background to cover what passes under it", railPaint !== "rgba(0, 0, 0, 0)", railPaint);
    await page.screenshot({ path: path.join(SHOTS, "06b-phone-scrolled.png") });
    await page.screenshot({ path: path.join(SHOTS, "06-phone.png") });

    record("== Kiswahili ==");
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(APP + "/settings/language", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('[id="language.site"] input'));
      radios.find((radio) => radio.value === "sw").click();
    });
    await sleep(400);
    const heading = await page.$eval(".settings-section-heading", (el) => el.textContent);
    check("the whole interface switches language", heading === "Lugha", heading);

    /* Kiswahili is written in Latin letters, so "this looks like English" is not
       a test. The only reliable question is whether the string exists in the
       Kiswahili copy at all: anything the page shows that the copy file does
       not contain is, by definition, something nobody translated. */
    const stray = await page.evaluate((allowed) => {
      const known = new Set(allowed);

      return Array.from(document.querySelectorAll(".settings-page *"))
        .filter((node) => node.children.length === 0)
        .map((node) => node.textContent.trim())
        .filter((text) => text.length > 0 && !known.has(text));
    }, allowedCopy);

    check("no untranslated string is left on the page", stray.length === 0, stray.join(" | "));
    await page.screenshot({ path: path.join(SHOTS, "07-swahili.png") });

    record("== phone, Kiswahili ==");
    /* The sticky rail is offset by the measured height of the search area, so
       the case that actually stresses it is the one where that area is tallest:
       a narrow screen with Kiswahili help text that wraps onto a second line. */
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(APP + "/settings/notifications", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      document.querySelector(".settings-body").scrollTop = 120;
    });
    await sleep(300);

    const stack = await page.evaluate(() => {
      const search = document.querySelector(".settings-search").getBoundingClientRect();
      const rail = document.querySelector(".settings-nav").getBoundingClientRect();
      return { searchBottom: search.bottom, railTop: rail.top, railHeight: rail.height };
    });
    /* The rail may not ride up over the search box, and it must have collapsed
       to a single scrollable strip rather than pushing the content off screen. */
    check(
      "the rail starts exactly where the search area ends",
      Math.abs(stack.railTop - stack.searchBottom) < 1.5,
      `rail top ${stack.railTop}, search bottom ${stack.searchBottom}`,
    );
    check(
      "the rail leaves room for the section itself",
      stack.railHeight > 0 && stack.railHeight < 140,
      `${Math.round(stack.railHeight)}px`,
    );
    await page.screenshot({ path: path.join(SHOTS, "07b-phone-swahili.png") });

    await page.setViewport({ width: 1280, height: 900 });

    record("== closing the popup ==");
    /* Opening it from a story rather than the home page, so "you go back to
       where you were" is actually being tested against a real place. */
    await page.goto(APP + "/stories", { waitUntil: "networkidle0" });
    await page.click(".nav-settings a[href='/settings']");
    await sleep(500);
    check("it opened over the stories page", page.url().endsWith("/settings"));

    await page.keyboard.press("Escape");
    await sleep(500);
    check("Escape closes it", (await page.$$(".settings-scrim")).length === 0);
    check("and returns to the stories page", page.url().endsWith("/stories"), page.url());
    check(
      "the page is interactive again",
      await page.evaluate(() => !document.getElementById("root").hasAttribute("inert")),
    );
    check(
      "and it scrolls again",
      (await page.evaluate(() => getComputedStyle(document.body).overflow)) !== "hidden",
    );

    await page.click(".nav-settings a[href='/settings']");
    await sleep(400);
    await page.mouse.click(40, 40);
    await sleep(400);
    check("clicking the scrim closes it too", (await page.$$(".settings-scrim")).length === 0);

    await page.click(".nav-settings a[href='/settings']");
    await sleep(400);
    await page.click(".settings-modal-close");
    await sleep(400);
    check("the close button works as well", (await page.$$(".settings-scrim")).length === 0);

    await page.click(".nav-settings a[href='/settings']");
    await sleep(400);
    await page.goBack();
    await sleep(400);
    check("the back button closes it too", (await page.$$(".settings-scrim")).length === 0);

    record("== leaving the popup ==");
    await page.goto(APP + "/settings/privacy", { waitUntil: "networkidle0" });
    await sleep(400);
    await page.click('.settings-content a[href="/privacy-policy"]');
    await sleep(500);
    check("a link out of the popup closes it", (await page.$$(".settings-scrim")).length === 0);
    check("and lands on the page it names", page.url().endsWith("/privacy-policy"), page.url());
  } finally {
    await browser.close();
    server.kill();
  }

  record(failed === 0 ? "\nAll settings checks passed." : "\n" + failed + " check(s) failed.");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


