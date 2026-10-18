#!/usr/bin/env node
// SEMEIA o Reel com cenas da Vínculo Digital PELA API do próprio app (nada direto no banco):
//   - projeto "Jesús nos Guía" (cria se não existir) e kits de marca HDMOJ e JNG;
//   - padrões "Padrão HDMOJ v2" e "Padrão JNG v2" (os mesmos de src/lib/studio/cenas-spec.ts);
//   - biblioteca de cenas com os clipes licenciados de /root/viral_canais/_build/footage
//     (Mixkit Stock Video Free License e Wikimedia CC0/domínio público), por categoria.
// Idempotente: o que já existe (mesmo título + mesma origem) é pulado.
//
// Uso: node scripts/seed-cenas.mjs --url https://... --email admin@... --senha-arquivo /caminho
//      [--catalogo /root/viral_canais/_build/footage/clips.json] [--padroes arquivo.json] [--so-kits]
// A senha é lida do arquivo (nunca na linha de comando). O login tem de ser da organização Vínculo Digital.
import { readFileSync } from "node:fs";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("url").replace(/\/+$/, "");
const EMAIL = arg("email");
const PASSWORD = readFileSync(arg("senha-arquivo"), "utf8").trim();
const CATALOG = arg("catalogo", "/root/viral_canais/_build/footage/clips.json");
const TEMPLATES = JSON.parse(readFileSync(arg("padroes"), "utf8")); // [{project: "hdmoj"|"jng", name, settings}]

const CATEGORY = {
  cidade: ["mk11", "mk42343", "mk49878", "mk41161", "mk4240", "mk50990", "mk40654", "mk41375"],
  "mar/praia": ["mk44370", "mk44392"],
  rio: ["mk43609"],
  floresta: ["mk41545"],
  montanha: ["mk51689", "mk43301"],
  estrada: ["mk41576"],
  "nascer do sol": ["mk52452"],
  pessoas: ["mk608", "mk609", "mk32809", "mk597", "mk40766"],
  tempo: ["mk28897", "mk39825"],
  "céu/luz": ["mk4113", "mk51106", "mk515", "mk3009", "mk3006", "mk1704", "mk4433", "mk1706", "mk4119", "mk39705", "mk4204"],
  nuvens: ["mk21575", "mk39704", "mk39707", "mk51105", "mk26112", "mk39708"],
  igreja: ["mk22723", "mk22712", "mk22715", "mk22711", "mk22713", "mk22708", "mk22718", "mk4201", "mk22719"],
  velas: ["mk41739", "mk3438", "mk3458", "mk3461", "mk3453", "wcaa516dbd"],
  "bíblia": ["wcbibleA", "wcbibleB"],
  natureza: ["mk1926", "mk4881"],
};
// trecho da Bíblia (CC0) tem texto em inglês entre 3 e 9 s: só os trechos sem texto, desfocados
const LENGTH = { wcbibleA: 4.4, wcbibleB: 4.7 };
const LICENSE = { "Mixkit Stock Video Free License": "mixkit", CC0: "cc0", "Public domain": "pd" };

const KITS = {
  hdmoj: { name: "Hora de Mudar o Jogo", handle: "@horademudarojogo", segment: "Desenvolvimento pessoal e mudança de vida", offer: "Conteúdo e desafio para sair da estagnação", audience: "Adultos de 25 a 45 anos que se sentem estagnados", palette: { background: "#F5F1E6", text: "#0B0B0B", accent: "#F5C518", support: "#E8E0C8" }, fontPair: "impacto", sector: "geral", tone: { adjectives: ["direto", "provocativo", "motivacional"], avoid: ["promessa de enriquecimento"] } },
  jng: { name: "Jesús nos Guía", handle: "@jesusnosguia.es", segment: "Devocional cristão em espanhol", offer: "Versículos e reflexões diárias", audience: "Cristãos hispanofalantes do México e da América Latina", palette: { background: "#F6EFE2", text: "#121A2B", accent: "#D8B26A", support: "#E3D9C6" }, fontPair: "serifa", sector: "geral", tone: { adjectives: ["acolhedor", "sereno", "esperançoso"], avoid: ["promessa de milagre"] } },
};

let cookie = "";
async function api(method, p, body, raw) {
  const headers = { cookie };
  let payload;
  if (raw) { headers["content-type"] = "application/octet-stream"; payload = raw; }
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${p}`, { method, headers, body: payload });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${data?.error || ""}`);
  return data;
}

const t0 = Date.now();
await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
const me = await api("GET", "/api/me");
console.log(`login ok, organização: ${me.organization?.name}`);
if (!/V[ií]nculo Digital/.test(me.organization?.name || "")) throw new Error("o login não é da Vínculo Digital: parei");

// projetos
let projects = await api("GET", "/api/projects");
const find = (re) => projects.find((p) => re.test(p.name));
let hdmoj = find(/Hora de Mudar o Jogo/i);
if (!hdmoj) throw new Error("projeto Hora de Mudar o Jogo não encontrado");
let jng = find(/Jes[uú]s nos Gu[ií]a/i);
if (!jng) {
  jng = await api("POST", "/api/projects", { name: "Jesús nos Guía", description: "Devocional em espanhol (@jesusnosguia.es)", color: "#d8b26a", icon: "✝️", platforms: ["instagram", "tiktok", "youtube"] });
  console.log(`projeto criado: Jesús nos Guía ${jng._id}`);
  projects = await api("GET", "/api/projects");
}
const pid = { hdmoj: hdmoj._id, jng: jng._id };

// kits
for (const [k, kit] of Object.entries(KITS)) {
  await api("PUT", "/api/estudio/kit", { project: pid[k], ...kit });
  console.log(`kit salvo: ${kit.name}`);
}
// padrões
for (const t of TEMPLATES) {
  const list = await api("GET", `/api/estudio/padroes?project=${pid[t.project]}`);
  const have = list.find((x) => x.name === t.name);
  if (have) await api("PUT", `/api/estudio/padroes/${have._id}`, { settings: t.settings, isDefault: true });
  else await api("POST", "/api/estudio/padroes", { project: pid[t.project], name: t.name, settings: t.settings, isDefault: true });
  console.log(`padrão ${have ? "atualizado" : "criado"}: ${t.name}`);
}
if (process.argv.includes("--so-kits")) process.exit(0);

// cenas
const cat = JSON.parse(readFileSync(CATALOG, "utf8"));
const dir = path.dirname(CATALOG);
const existing = new Set((await api("GET", "/api/estudio/cenas")).scenes.map((s) => `${s.title}|${s.sourceUrl}`));
let added = 0, skipped = 0;
for (const [category, ids] of Object.entries(CATEGORY)) {
  for (const id of ids) {
    const c = cat[id];
    if (!c) throw new Error(`clipe ${id} não está no catálogo`);
    const lic = LICENSE[c.license];
    if (!lic) throw new Error(`licença desconhecida em ${id}: ${c.license}`);
    const title = `${c.title.replace(/^File:/, "")}${LENGTH[id] ? ` (trecho ${c.in}s)` : ""}`.slice(0, 140);
    if (existing.has(`${title}|${c.src}`)) { skipped++; continue; }
    const q = new URLSearchParams({ categoria: category, licenca: lic, fonte: c.src, titulo: title, autor: c.author || "", foco: String(c.fx ?? 0.5), inicio: String(c.in ?? 0.5), desfoque: String(c.blur || 0), name: path.basename(c.file) });
    if (LENGTH[id]) q.set("duracao", String(LENGTH[id]));
    const t = Date.now();
    const s = await api("POST", `/api/estudio/cenas?${q}`, undefined, readFileSync(path.join(dir, c.file)));
    added++;
    console.log(`+ ${category.padEnd(14)} ${id.padEnd(11)} ${s.seconds}s ${(s.bytes / 1e6).toFixed(1)} MB ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }
}
const lib = await api("GET", "/api/estudio/cenas");
console.log(`cenas: ${added} novas, ${skipped} já existiam; biblioteca: ${lib.scenes.length} (${lib.categories.map((c) => `${c.name} ${c.count}`).join(", ")}); ${((Date.now() - t0) / 1000).toFixed(0)} s`);
