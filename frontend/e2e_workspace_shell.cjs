/**
 * Visual check for the workspace frame.
 *
 * Signs in with the local dev admin, then screenshots every /admin route at a
 * desktop and a phone width so the rail, the gutter and the palette can be
 * compared side by side. Credentials come from backend/.env; nothing is
 * printed.
 */
const fs = require("fs");
const path = require("path");

const APP = process.env.TSV_APP || "http://localhost:5174";
const API = process.env.TSV_API || "http://127.0.0.1:8000";
const OUT = path.join(__dirname, "workspace-shots");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

(async () => {
  const env = readEnv(path.join(__dirname, "..", "backend", ".env"));
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("no admin credentials in backend/.env");

  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  const token = (await response.json()).access_token;

  fs.mkdirSync(OUT, { recursive: true });

  // Open a real design rather than the "create one?" dialog: the dialog is a
  // full-screen scrim, so a screenshot of it says nothing about the chrome.
  // One is created only if the workspace has none.
  const auth = { Authorization: `Bearer ${token}` };
  const listExperiences = async () => {
    const result = await (await fetch(`${API}/experiences/`, { headers: auth })).json();
    return Array.isArray(result) ? result : result.items || [];
  };

  let experiences = await listExperiences();
  if (!experiences.length) {
    const created = await fetch(`${API}/experiences/`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Frame check", experience_type: "journey", language: "en" }),
    });
    if (!created.ok) throw new Error(`could not create an experience: ${created.status}`);
    experiences = await listExperiences();
  }
  const builderRoute = `/admin/experience-builder?id=${experiences[0].id}`;

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const routes = [
    ["console", "/admin"],
    ["practice", "/admin/practice"],
    ["builder", builderRoute],
    ["resources", "/admin/resources"],
  ];

  for (const [width, height, tag] of [[1440, 900, "desktop"], [414, 896, "phone"]]) {
    for (const theme of ["dark", "light"]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(
      (t, v) => {
        window.localStorage.setItem("access_token", t);
        window.localStorage.setItem("tsv-appearance-theme", v);
      },
      token,
      theme,
    );
    await page.goto(APP + "/admin", { waitUntil: "domcontentloaded" });
    await page.evaluate((v) => document.documentElement.setAttribute("data-theme", v), theme);

    for (const [name, route] of routes) {
      await page.goto(APP + route, { waitUntil: "networkidle2", timeout: 30000 });
      await page.evaluate((v) => document.documentElement.setAttribute("data-theme", v), theme);
      // Wait for the frame itself rather than sleeping a guessed interval: on a
      // cold route the first paint can land after it, and measuring a document
      // that has not rendered yet reports a missing rail as a layout fault.
      await page.waitForSelector(".admin-shell", { timeout: 15000 });
      await sleep(2200);
      await page.screenshot({ path: path.join(OUT, `${name}-${tag}-${theme}.png`) });

      const facts = await page.evaluate(() => {
        const rail = document.querySelector(".cms-sidebar");
        const work = document.querySelector(".cms-workspace");
        const shell = document.querySelector(".admin-shell");
        const bar = document.querySelector(".eb-topbar");
        if (!rail || !work || !shell) {
          return { ok: false, rail: Boolean(rail), work: Boolean(work) };
        }
        const ws = getComputedStyle(work);
        const railBox = rail.getBoundingClientRect();
        return {
          ok: true,
          gutter: ws.paddingLeft + " / " + ws.paddingTop + " / " + ws.paddingRight,
          canvas: getComputedStyle(shell).backgroundColor,
          accent: getComputedStyle(shell).getPropertyValue("--accent").trim(),
          railWidth: Math.round(railBox.width),
          railBottom: Math.round(railBox.bottom),
          shellFont: getComputedStyle(shell).fontFamily.split(",")[0],
          // A tool bar that has wrapped onto a second row is the tell that the
          // rail took room the builder used to have to itself.
          topbarHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
          viewport: window.innerHeight,
          overflowY: document.documentElement.scrollHeight > window.innerHeight + 2,
        };
      });
      console.log(`${tag}/${theme} ${name}:`, JSON.stringify(facts));
    }
    await page.close();
    }
  }

  await browser.close();
  console.log("shots ->", OUT);
})();