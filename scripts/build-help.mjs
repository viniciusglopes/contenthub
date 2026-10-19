#!/usr/bin/env node
// AJUDA: os artigos moram em docs/ajuda/*.md e os guias de cada TELA em docs/ajuda/telas/*.md (versionados
// no git). Este script gera src/lib/help/content.generated.ts, que vai junto no build (roda sozinho antes do
// `npm run build`).
// Cabeçalho de cada artigo (entre linhas ---): id, titulo, resumo, ordem, admin (true = só administrador), tags.
// Cabeçalho de cada tela: id, area (item do menu), titulo, resumo, artigo, ordem, admin, url, alvos, antes.
//   `url`, `alvos` e `antes` só servem para tirar o print (scripts/help-shots.cjs); a lista numerada do corpo
//   explica cada número marcado no print, na mesma ordem dos `alvos`.
// Bloco "fora da plataforma" dentro de um artigo (passo que acontece na Meta, Hotmart, Kiwify...):
//   :::fora Nome do lugar
//   link: https://endereço-oficial
//   caminho: Menu > Submenu > Botão          (cada parte vira um número do desenho)
//   copie: o que copiar lá
//   cole: onde colar no ContentHub
//   desenho: id do desenho em public/ajuda/externo/<id>.svg (gerado por scripts/build-help-drawings.mjs)
//   :::
// `node scripts/build-help.mjs --check` só confere se o gerado está em dia (usado nos testes).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "docs", "ajuda");
const screensDir = path.join(dir, "telas");
const pub = path.join(root, "public");
const out = path.join(root, "src", "lib", "help", "content.generated.ts");

function header(file, text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error(`${file}: falta o cabeçalho entre ---`);
  const meta = Object.fromEntries(m[1].split("\n").filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")]; }));
  if (/—/.test(m[2])) throw new Error(`${file}: tem travessão`);
  return { meta, body: m[2].trim() };
}

/** Os blocos :::fora de um texto, já conferidos. */
export function outsideBlocks(file, body) {
  const blocks = [];
  for (const m of body.matchAll(/^:::fora (.+)\n([\s\S]*?)\n:::$/gm)) {
    const f = Object.fromEntries(m[2].split("\n").filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    if (!/^https:\/\/[^\s]+$/.test(f.link || "")) throw new Error(`${file}: bloco fora "${m[1]}" sem link https`);
    if (!f.caminho) throw new Error(`${file}: bloco fora "${m[1]}" sem caminho`);
    if (f.desenho && !existsSync(path.join(pub, "ajuda", "externo", `${f.desenho}.svg`))) throw new Error(`${file}: desenho ${f.desenho}.svg não existe (rode node scripts/build-help-drawings.mjs)`);
    blocks.push({ place: m[1].trim(), ...f });
  }
  const opened = (body.match(/^:::fora /gm) || []).length;
  if (opened !== blocks.length) throw new Error(`${file}: bloco :::fora sem fechar`);
  return blocks;
}

export function parse(file, text) {
  const { meta, body } = header(file, text);
  for (const k of ["id", "titulo", "resumo", "ordem"]) if (!meta[k]) throw new Error(`${file}: falta ${k}`);
  if (!/^[a-z0-9-]+$/.test(meta.id)) throw new Error(`${file}: id inválido`);
  outsideBlocks(file, body);
  return { id: meta.id, title: meta.titulo, summary: meta.resumo, order: Number(meta.ordem), admin: meta.admin === "true", tags: (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean), body };
}

/** Largura e altura de um .webp (cabeçalhos VP8, VP8L e VP8X), sem dependência. */
function webpSize(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") throw new Error(`${file}: não é webp`);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (kind === "VP8L") { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

export function parseScreen(file, text) {
  const { meta, body } = header(file, text);
  for (const k of ["id", "area", "titulo", "resumo", "artigo", "ordem", "url", "alvos"]) if (!meta[k]) throw new Error(`${file}: falta ${k}`);
  if (!/^[a-z0-9-]+$/.test(meta.id)) throw new Error(`${file}: id inválido`);
  const steps = body.split("\n").filter((l) => /^\d+\.\s+/.test(l)).map((l) => l.replace(/^\d+\.\s+/, "").trim());
  const targets = meta.alvos.split("|").map((t) => t.trim()).filter(Boolean);
  if (steps.length !== targets.length) throw new Error(`${file}: ${steps.length} passos e ${targets.length} alvos (precisam ser iguais: cada número do print é um passo)`);
  const image = `/ajuda/telas/${meta.id}.webp`;
  const img = path.join(pub, image);
  if (!existsSync(img)) throw new Error(`${file}: falta o print ${image} (rode scripts/help-shots.cjs com o demo no ar)`);
  return { id: meta.id, area: meta.area, title: meta.titulo, summary: meta.resumo, article: meta.artigo, order: Number(meta.ordem), admin: meta.admin === "true", image, ...webpSize(img), steps };
}

const articles = readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => parse(f, readFileSync(path.join(dir, f), "utf8"))).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
const ids = new Set();
for (const a of articles) { if (ids.has(a.id)) throw new Error(`id repetido: ${a.id}`); ids.add(a.id); }
const screens = readdirSync(screensDir).filter((f) => f.endsWith(".md")).sort().map((f) => parseScreen(f, readFileSync(path.join(screensDir, f), "utf8"))).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
const sids = new Set();
for (const s of screens) {
  if (sids.has(s.id)) throw new Error(`tela repetida: ${s.id}`);
  sids.add(s.id);
  if (!ids.has(s.article)) throw new Error(`tela ${s.id}: artigo ${s.article} não existe`);
}
const code = `// GERADO por scripts/build-help.mjs a partir de docs/ajuda/*.md e docs/ajuda/telas/*.md. Não edite aqui: edite o .md.\nimport type { Article, Screen } from "./types";\n\nexport const ARTICLES: Article[] = ${JSON.stringify(articles, null, 2)};\n\nexport const SCREENS: Screen[] = ${JSON.stringify(screens, null, 2)};\n`;
if (process.argv.includes("--check")) {
  const cur = readFileSync(out, "utf8");
  if (cur !== code) { console.error("content.generated.ts desatualizado: rode node scripts/build-help.mjs"); process.exit(1); }
  console.log(`ajuda em dia (${articles.length} artigos, ${screens.length} telas)`);
} else {
  writeFileSync(out, code);
  console.log(`ajuda: ${articles.length} artigos e ${screens.length} telas gerados`);
}
