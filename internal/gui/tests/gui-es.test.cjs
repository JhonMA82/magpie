// Run with Node's test runner and Playwright on the module path; see README.md.
// Spanish (es-419), as gui-de.test.cjs has German: every string the GUI has
// in Chinese it has in Spanish, with the same {placeholders} and tags. Picked
// in Settings, or the system's language when that is Spanish, the window
// reads in Spanish, its <html lang> is es-419, and Settings offers Español.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { strings } = require("./strings.cjs");
const { chromium, webkit } = require("playwright");

const assets = path.resolve(__dirname, "../assets");

test("es has every zh string, with its placeholders and tags", async () => {
  const { I18N } = strings(); // i18n.js's and the plugins'
  const zh = Object.keys(I18N.zh), es = I18N.es;
  assert.deepEqual(zh.filter((k) => !(k in es)), [], "missing in es");
  assert.deepEqual(Object.keys(es).filter((k) => !(k in I18N.zh)), [], "es only");
  const marks = (s) => [...s.matchAll(/\{\w+\}|<\/?\w+[^>]*>/g)].map((m) => m[0]).sort();
  for (const k of zh) {
    assert.equal(typeof es[k], "string", k);
    assert.deepEqual(marks(es[k]), marks(k), `es for ${JSON.stringify(k)}`);
  }
});

function serve(lang) {
  const settings = { lang, theme: "light" };
  return async (r) => {
    const url = new URL(r.request().url());
    const json = (data) => r.fulfill({ json: data });
    if (url.pathname === "/boot.js") return r.fulfill({ contentType: "text/javascript", body: `window.bootPrefs = {lang:"${lang}",theme:"light",web:true};` });
    if (url.pathname === "/wails/runtime.js") return r.fulfill({ contentType: "text/javascript", body: "export const Window = {};" });
    if (url.pathname === "/api/state") return json({ agents: [], profiles: [], settings });
    if (url.pathname === "/api/settings") return json(settings);
    if (url.pathname === "/api/gateway/trace") return url.searchParams.get("wait") ? new Promise(() => {}) : json({ mine: true, now: new Date().toISOString(), seq: 0, totals: {}, routes: [] });
    if (url.pathname === "/api/providers") return json({ providers: [], presets: [], excluded: [], gateway: { running: true, window: true, url: "http://127.0.0.1:3999" } });
    if (url.pathname === "/api/plugins") return json({ plugins: [] });
    if (url.pathname.startsWith("/api/")) return json({});
    const file = path.join(assets, url.pathname === "/" ? "index.html" : url.pathname);
    const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(file)];
    try { await r.fulfill({ body: await fs.readFile(file), contentType }); } catch { await r.fulfill({ status: 404, body: "" }); }
  };
}

for (const [name, engine] of (process.env.BROWSER ? [[process.env.BROWSER, process.env.BROWSER === "webkit" ? webkit : chromium]] : [["webkit", webkit], ["chromium", chromium]])) {
  test(`${name}: the window reads in Spanish when picked or the system's`, async () => {
    const browser = await engine.launch();
    try {
      for (const [lang, sys, want] of [["es", "en-US", "es"], ["system", "es-MX", "es"], ["system", "es-AR", "es"], ["system", "en-US", "en"]]) {
        const page = await (await browser.newContext({ locale: sys, viewport: { width: 1000, height: 760 } })).newPage();
        page.setDefaultTimeout(5000);
        page.setDefaultNavigationTimeout(60000);
        await page.route("**/*", serve(lang));
        await page.goto("http://magpie.test/");
        await page.waitForFunction(() => typeof locale === "string" && document.documentElement.lang);
        const got = await page.evaluate(() => ({
          locale, lang: document.documentElement.lang,
          nav: [...document.querySelectorAll("button[data-view]")].map((b) => b.textContent.trim()).slice(0, 5),
          offered: LOCALES.map(([v, l]) => v + ":" + l),
        }));
        assert.equal(got.locale, want, `${lang} on ${sys}`);
        assert.ok(got.offered.includes("es:Español"));
        if (want === "es") {
          assert.equal(got.lang, "es-419");
          assert.deepEqual(got.nav, ["Agentes", "Sesiones", "Biblioteca", "Proveedores", "Enrutamiento"]);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  });
}
