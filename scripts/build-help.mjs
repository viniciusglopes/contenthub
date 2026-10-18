#!/usr/bin/env node
// AJUDA: os artigos moram em docs/ajuda/*.md (versionados no git). Este script gera
// src/lib/help/content.generated.ts, que vai junto no build (roda sozinho antes do `npm run build`).
// Cabeçalho de cada arquivo (entre linhas ---): id, titulo, resumo, ordem, admin (true = só administrador), tags.
// `node scripts/build-help.mjs --check` só confere se o gerado está em dia (usado nos testes).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "docs", "ajuda");
const out = path.join(root, "src", "lib", "help", "content.generated.ts");

export function parse(file, text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error(`${file}: falta o cabeçalho entre ---`);
  const meta = Object.fromEntries(m[1].split("\n").filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")]; }));
  for (const k of ["id", "titulo", "resumo", "ordem"]) if (!meta[k]) throw new Error(`${file}: falta ${k}`);
  if (!/^[a-z0-9-]+$/.test(meta.id)) throw new Error(`${file}: id inválido`);
  if (/—/.test(m[2])) throw new Error(`${file}: tem travessão`);
  return { id: meta.id, title: meta.titulo, summary: meta.resumo, order: Number(meta.ordem), admin: meta.admin === "true", tags: (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean), body: m[2].trim() };
}

const articles = readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => parse(f, readFileSync(path.join(dir, f), "utf8"))).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
const ids = new Set();
for (const a of articles) { if (ids.has(a.id)) throw new Error(`id repetido: ${a.id}`); ids.add(a.id); }
const code = `// GERADO por scripts/build-help.mjs a partir de docs/ajuda/*.md. Não edite aqui: edite o .md.\nimport type { Article } from "./types";\n\nexport const ARTICLES: Article[] = ${JSON.stringify(articles, null, 2)};\n`;
if (process.argv.includes("--check")) {
  const cur = readFileSync(out, "utf8");
  if (cur !== code) { console.error("content.generated.ts desatualizado: rode node scripts/build-help.mjs"); process.exit(1); }
  console.log(`ajuda em dia (${articles.length} artigos)`);
} else {
  writeFileSync(out, code);
  console.log(`ajuda: ${articles.length} artigos gerados`);
}
