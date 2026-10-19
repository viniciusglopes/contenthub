#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- script Node (CommonJS) fora do app */
// AJUDA: tira o PRINT de cada tela de docs/ajuda/telas/*.md no demo local, marca os `alvos` com número e
// contorno, e salva em public/ajuda/telas/<id>.webp. Depois rode `node scripts/build-help.mjs`.
//
// Precisa do demo no ar (npm run demo:db, npm run demo:seed e o app em 127.0.0.1) e do puppeteer:
//   HELP_SHOTS_BASE=http://127.0.0.1:44199 node scripts/help-shots.cjs [id ...]
// Variáveis: HELP_SHOTS_EMAIL / HELP_SHOTS_PASSWORD (padrão: ADMIN_EMAIL / ADMIN_PASSWORD do demo),
// HELP_SHOTS_PROJECT (nome do projeto usado em {projeto}), PUPPETEER_PATH, CHROME_PATH.
// Nunca rode contra produção: os prints mostram os dados de quem entrou.
//
// Alvos (separados por |): id:<data-testid>, a:<aria-label>, t:<texto do botão/link/aba>, ph:<placeholder>,
// menu:<item do menu lateral>, css:<seletor>; "@2" no fim pega a 2ª ocorrência.
// Antes do print (antes:, separados por ;): "clique <alvo>". altura: outra altura de tela (padrão 800).
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const BASE = process.env.HELP_SHOTS_BASE || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("HELP_SHOTS_BASE precisa ser o demo local (http://127.0.0.1:porta).");
  process.exit(1);
}
const puppeteer = require(process.env.PUPPETEER_PATH || "/usr/lib/node_modules/puppeteer");
const sharp = require(path.join(root, "node_modules", "sharp"));
const W = 1280;
const H = 800;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function readScreens(only) {
  const dir = path.join(root, "docs", "ajuda", "telas");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const head = /^---\n([\s\S]*?)\n---/.exec(text)[1];
    const meta = Object.fromEntries(head.split("\n").filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    return { id: meta.id, url: meta.url, height: Number(meta.altura || H), targets: meta.alvos.split("|").map((s) => s.trim()).filter(Boolean), before: (meta.antes || "").split(";").map((s) => s.trim()).filter(Boolean) };
  }).filter((s) => !only.length || only.includes(s.id));
}

// Roda dentro da página: acha o elemento de um alvo (visível e por cima de tudo no centro dele).
function finder() {
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}#@+?]+/u, "").toLowerCase();
  const shown = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const onTop = (e) => {
    const r = e.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 20), 1), innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (e === hit || e.contains(hit) || hit.contains(e) || (e.tagName === "OPTION")));
  };
  window.__find = (spec, noScroll = false) => {
    let [, kind, value, nth] = /^(\w+):(.*?)(?:@(\d+))?$/.exec(spec) || [];
    nth = Number(nth || 1);
    let list = [];
    const want = norm(value);
    if (kind === "id") list = [...document.querySelectorAll(`[data-testid="${value}"]`)];
    else if (kind === "a") list = [...document.querySelectorAll(`[aria-label="${value}"]`)];
    else if (kind === "css") list = [...document.querySelectorAll(value)];
    else if (kind === "ph") list = [...document.querySelectorAll("input,textarea")].filter((e) => norm(e.placeholder).startsWith(want));
    else if (kind === "menu") list = [...document.querySelectorAll("aside button")].filter((e) => norm(e.innerText).startsWith(want));
    else if (kind === "t") {
      const pool = [...document.querySelectorAll("button,a,label,summary,select,[role=tab],h1,h2,h3,h4,th")];
      const score = (e) => { const s = norm(e.tagName === "SELECT" ? e.options[e.selectedIndex]?.text : e.innerText); return s === want ? 3 : s.startsWith(want) ? 2 : (e.tagName === "BUTTON" || e.tagName === "A") && s.includes(want) ? 1 : 0; };
      list = pool.map((e) => [e, score(e)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      if (!list.length) list = [...document.querySelectorAll("div,span,p")].filter((e) => !e.children.length && norm(e.innerText).startsWith(want)).map((e) => e.closest("[class*=rounded]") || e);
    }
    const inView = (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 2 && (r.bottom <= innerHeight + 2 || (r.height > innerHeight / 2 && r.top < innerHeight - 40)); };
    const vis = [...new Set(list)].filter(shown);
    // 1º o que já está na tela (sem rolar nada); só se não houver, rola até o primeiro.
    const here = vis.filter((e) => inView(e) && onTop(e));
    if (here[nth - 1] || noScroll) return here[nth - 1] || null;
    for (const e of vis) {
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (inView(e) && onTop(e)) { here.push(e); if (here[nth - 1]) return here[nth - 1]; }
    }
    return null;
  };
  window.__mark = (els) => {
    const layer = document.createElement("div");
    layer.id = "__marks";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    els.forEach((e, i) => {
      if (!e) return;
      const r = e.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;border:3px solid #ff2d87;border-radius:10px;box-shadow:0 0 0 2px rgba(0,0,0,.55),0 0 18px rgba(255,45,135,.55)`;
      const n = document.createElement("div");
      const bx = Math.min(Math.max(r.left - 18, 4), innerWidth - 34);
      const by = Math.min(Math.max(r.top - 18, 4), innerHeight - 34);
      n.textContent = String(i + 1);
      n.style.cssText = `position:fixed;left:${bx}px;top:${by}px;width:30px;height:30px;border-radius:50%;background:#ff2d87;color:#fff;font:700 16px/24px Inter,system-ui,sans-serif;text-align:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6)`;
      layer.append(box, n);
    });
    document.body.append(layer);
  };
}

(async () => {
  const only = process.argv.slice(2);
  const email = process.env.HELP_SHOTS_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.HELP_SHOTS_PASSWORD || process.env.ADMIN_PASSWORD;
  const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const [name, value] = [cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1)];
  const projects = await (await fetch(`${BASE}/api/projects`, { headers: { cookie } })).json();
  const proj = projects.find((p) => p.name === (process.env.HELP_SHOTS_PROJECT || "Hora de Mudar o Jogo")) || projects[0];
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/snap/bin/chromium", headless: true, args: ["--no-sandbox", "--lang=pt-BR"] });
  const outDir = path.join(root, "public", "ajuda", "telas");
  fs.mkdirSync(outDir, { recursive: true });
  const problems = [];
  for (const s of readScreens(only)) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: s.height });
    await page.setCookie({ name, value, domain: new URL(BASE).hostname, path: "/" });
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch { /* sem armazenamento */ } });
    await page.goto(BASE + s.url.replace("{projeto}", proj._id), { waitUntil: "networkidle0", timeout: 120000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important;transition:none!important;animation:none!important}" });
    await wait(1200);
    await page.evaluate(finder);
    for (const step of s.before) {
      const target = step.replace(/^clique\s+/, "");
      const ok = await page.evaluate((t) => { const e = window.__find(t); if (e) e.click(); return Boolean(e); }, target);
      if (!ok) problems.push(`${s.id}: antes "${step}" não achou`);
      await wait(900);
    }
    await page.evaluate(() => { const a = document.querySelector("aside"); if (a) a.scrollTop = 0; });
    const missing = await page.evaluate((targets) => {
      targets.forEach((t) => window.__find(t));
      // achar pode ter rolado a tela: as posições finais, sem rolar mais; o que saiu da tela é falta
      const again = targets.map((t) => window.__find(t, true));
      window.__mark(again);
      return targets.filter((_, i) => !again[i]);
    }, s.targets);
    for (const m of missing) problems.push(`${s.id}: alvo "${m}" não achado`);
    await wait(150);
    const png = await page.screenshot({ type: "png" });
    await sharp(png).webp({ quality: 82 }).toFile(path.join(outDir, `${s.id}.webp`));
    console.log(`${s.id}.webp${missing.length ? `  FALTOU ${missing.join(", ")}` : ""}`);
    await page.close();
  }
  await browser.close();
  if (problems.length) { console.error(problems.join("\n")); process.exit(2); }
})().catch((e) => { console.error(e); process.exit(1); });
