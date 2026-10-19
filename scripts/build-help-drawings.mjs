#!/usr/bin/env node
// AJUDA: DESENHOS ILUSTRATIVOS das telas de fora do ContentHub (Meta, Instagram, Hotmart, Kiwify, Google,
// Pexels). Não são prints: não temos login nessas contas. São esquemas simples com os passos numerados, na
// mesma ordem do "caminho" do bloco :::fora do artigo, e com o selo "DESENHO ILUSTRATIVO".
// Gera public/ajuda/externo/<id>.svg. Rodar: node scripts/build-help-drawings.mjs
// Quando houver print real de uma dessas telas, ele pode substituir o desenho (mesmo nome, outra extensão no .md).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.join(root, "public", "ajuda", "externo");

const C = { bg: "#eef1f5", win: "#ffffff", bar: "#e4e7ec", side: "#f5f6f8", line: "#d5d9e0", text: "#1f2937", soft: "#6b7280", blue: "#1b74e4", mark: "#e11d74", hot: "#f04e23", kiwi: "#16a34a", g: "#1a73e8", ig: "#d62976" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "font-family=\"Inter, 'Segoe UI', Roboto, Arial, sans-serif\"";

function badge(x, y, n) {
  return `<g><circle cx="${x}" cy="${y}" r="13" fill="${C.mark}" stroke="#fff" stroke-width="2.5"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" ${FONT}>${n}</text></g>`;
}
function ring(x, y, w, h, r = 6) {
  return `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="${r + 2}" fill="none" stroke="${C.mark}" stroke-width="2.5"/>`;
}
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 13}" font-weight="${o.bold ? 700 : 400}" fill="${o.fill || C.text}" ${o.anchor ? `text-anchor="${o.anchor}"` : ""} ${FONT}>${esc(s)}</text>`;
/** Quebra um texto em linhas que caibam em `px` (estimativa de largura por caractere). */
function wrap(s, px, size) {
  const max = Math.max(6, Math.floor(px / (size * 0.56)));
  const out = [];
  let cur = "";
  for (const w of String(s).split(" ")) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}
const lines = (x, y, w, n) => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * 14}" width="${i === n - 1 ? w * 0.6 : w}" height="7" rx="3.5" fill="${C.line}"/>`).join("");

/** Uma janela de navegador com barra lateral e área principal; os elementos se empilham. */
function browser(px, py, W, H, s) {
  const accent = s.accent || C.blue;
  const out = [];
  const marks = [];
  out.push(`<rect x="${px}" y="${py}" width="${W}" height="${H}" rx="10" fill="${C.win}" stroke="${C.line}"/>`);
  out.push(`<path d="M${px} ${py + 10} a10 10 0 0 1 10 -10 h${W - 20} a10 10 0 0 1 10 10 v24 h-${W} z" fill="${C.bar}"/>`);
  out.push(["#f87171", "#fbbf24", "#34d399"].map((c, i) => `<circle cx="${px + 16 + i * 14}" cy="${py + 17}" r="4.5" fill="${c}"/>`).join(""));
  out.push(`<rect x="${px + 70}" y="${py + 7}" width="${Math.min(W - 90, 380)}" height="20" rx="10" fill="#fff"/>`, t(px + 82, py + 21, `🔒 ${s.url}`, { size: 11, fill: C.soft }));
  const hy = py + 34;
  out.push(`<rect x="${px}" y="${hy}" width="${W}" height="44" fill="#fff" stroke="${C.line}" stroke-width="0.6"/>`);
  out.push(`<rect x="${px + 16}" y="${hy + 14}" width="16" height="16" rx="4" fill="${accent}"/>`, t(px + 40, hy + 27, s.brand, { bold: true, size: 14 }));
  if (s.top) {
    const tw = 10 + s.top.t.length * 7;
    const tx = px + W - tw - 18;
    out.push(`<rect x="${tx}" y="${hy + 10}" width="${tw}" height="24" rx="6" fill="${C.side}" stroke="${C.line}"/>`, t(tx + 8, hy + 26, s.top.t, { size: 12 }));
    if (s.top.n) { out.push(ring(tx, hy + 10, tw, 24)); marks.push([tx - 6, hy + 10, s.top.n]); }
  }
  if (s.topLeft) {
    const tw = 10 + s.topLeft.t.length * 7;
    const tx = px + 60 + s.brand.length * 8;
    out.push(`<rect x="${tx}" y="${hy + 10}" width="${tw}" height="24" rx="6" fill="${C.side}" stroke="${C.line}"/>`, t(tx + 8, hy + 26, s.topLeft.t, { size: 12 }));
    if (s.topLeft.n) { out.push(ring(tx, hy + 10, tw, 24)); marks.push([tx + tw + 4, hy + 10, s.topLeft.n]); }
  }
  const sideW = s.side ? Math.min(220, W * 0.3) : 0;
  const by = hy + 44;
  let sideEnd = by;
  if (s.side) {
    out.push(`<rect x="${px}" y="${by}" width="${sideW}" height="${H - (by - py) - 1}" fill="${C.side}"/>`);
    let y = by + 14;
    for (const it of s.side) {
      if (it.section) { out.push(t(px + 14, y + 14, it.section.toUpperCase(), { size: 10, fill: C.soft, bold: true })); y += 24; continue; }
      const x = px + (it.indent ? 26 : 10);
      const w = sideW - (it.indent ? 34 : 20);
      const size = it.indent ? 11.5 : 12.5;
      const ls = wrap(it.t, w - 22, size);
      const h = 12 + ls.length * 15;
      if (it.active || it.n) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${it.n ? "#fde8f1" : "#e8eefc"}"/>`);
      ls.forEach((l, i) => out.push(t(x + 10, y + 18 + i * 15, l, { size, bold: !it.indent && Boolean(it.active || it.n) })));
      if (it.n) { out.push(ring(x, y, w, h)); marks.push([x + w - 2, y + 2, it.n]); }
      y += h + 4;
    }
    sideEnd = y;
  }
  const mx = px + sideW + 22;
  const mw = W - sideW - 44;
  let y = by + 18;
  for (const el of s.main || []) {
    if (el.h) { out.push(t(mx, y + 18, el.h, { size: 17, bold: true })); y += 32; }
    else if (el.p) { out.push(lines(mx, y + 2, Math.min(mw, 420), el.p)); y += el.p * 14 + 10; }
    else if (el.tabs) {
      let x = mx;
      for (const [i, tab] of el.tabs.entries()) {
        const tw = 16 + tab.length * 7.2;
        const on = i === el.active;
        out.push(t(x + 8, y + 18, tab, { size: 12.5, bold: on, fill: on ? accent : C.soft }));
        if (on) out.push(`<rect x="${x}" y="${y + 26}" width="${tw}" height="3" fill="${accent}"/>`);
        if (el.n && i === (el.nAt ?? el.active)) { out.push(ring(x, y, tw, 28)); marks.push([x + tw, y, el.n]); }
        x += tw + 8;
      }
      out.push(`<rect x="${mx}" y="${y + 29}" width="${mw}" height="1" fill="${C.line}"/>`);
      y += 42;
    } else if (el.btn) {
      const bw = 28 + el.btn.length * 8;
      const bx = el.right ? mx + mw - bw : mx;
      out.push(`<rect x="${bx}" y="${y}" width="${bw}" height="32" rx="7" fill="${el.ghost ? "#fff" : accent}" stroke="${el.ghost ? C.line : accent}"/>`, t(bx + bw / 2, y + 21, el.btn, { size: 12.5, bold: true, fill: el.ghost ? C.text : "#fff", anchor: "middle" }));
      if (el.n) { out.push(ring(bx, y, bw, 32)); marks.push([bx + bw + 4, y, el.n]); }
      if (el.menu) {
        let my = y + 38;
        out.push(`<rect x="${bx}" y="${my}" width="${Math.max(bw, 190)}" height="${el.menu.length * 30 + 8}" rx="8" fill="#fff" stroke="${C.line}" filter="url(#sh)"/>`);
        for (const m of el.menu) {
          const mi = typeof m === "string" ? { t: m } : m;
          if (mi.n) { out.push(`<rect x="${bx + 4}" y="${my + 4}" width="${Math.max(bw, 190) - 8}" height="26" rx="5" fill="#fde8f1"/>`, ring(bx + 4, my + 4, Math.max(bw, 190) - 8, 26)); marks.push([bx + Math.max(bw, 190) + 2, my + 4, mi.n]); }
          out.push(t(bx + 14, my + 22, mi.t, { size: 12 }));
          my += 30;
        }
        y = my + 16;
      } else y += 46;
    } else if (el.field) {
      out.push(t(mx, y + 12, el.field, { size: 11.5, fill: C.soft, bold: true }));
      const fw = Math.min(mw, el.w || 460);
      out.push(`<rect x="${mx}" y="${y + 18}" width="${fw}" height="30" rx="6" fill="#fff" stroke="${C.line}"/>`, t(mx + 10, y + 37, el.value || "", { size: 12, fill: el.value ? C.text : C.soft }));
      if (el.copy) out.push(`<rect x="${mx + fw - 66}" y="${y + 22}" width="58" height="22" rx="5" fill="${C.side}" stroke="${C.line}"/>`, t(mx + fw - 37, y + 37, "Copiar", { size: 11, anchor: "middle" }));
      if (el.n) { out.push(ring(mx, y + 18, fw, 30)); marks.push([mx + fw + 6, y + 18, el.n]); }
      y += 58;
    } else if (el.row) {
      const rw = Math.min(mw, 520);
      out.push(`<rect x="${mx}" y="${y}" width="${rw}" height="42" rx="8" fill="${C.side}" stroke="${C.line}"/>`, `<circle cx="${mx + 22}" cy="${y + 21}" r="11" fill="${el.dot || C.line}"/>`, t(mx + 42, y + 26, el.row, { size: 12.5, bold: true }));
      if (el.btn2) {
        const bw = 24 + el.btn2.length * 7.8;
        const bx = mx + rw - bw - 8;
        out.push(`<rect x="${bx}" y="${y + 7}" width="${bw}" height="28" rx="6" fill="${accent}"/>`, t(bx + bw / 2, y + 25, el.btn2, { size: 12, bold: true, fill: "#fff", anchor: "middle" }));
        if (el.n) { out.push(ring(bx, y + 7, bw, 28)); marks.push([bx + bw + 4, y + 4, el.n]); }
      } else if (el.n) { out.push(ring(mx, y, rw, 42)); marks.push([mx + rw + 4, y, el.n]); }
      y += 52;
    } else if (el.checks) {
      const top = y;
      for (const c of el.checks) {
        out.push(`<rect x="${mx}" y="${y + 3}" width="16" height="16" rx="4" fill="${accent}"/>`, `<path d="M${mx + 4} ${y + 11} l3.5 3.5 l6 -7" stroke="#fff" stroke-width="2" fill="none"/>`, t(mx + 26, y + 16, c, { size: 12.5 }));
        y += 26;
      }
      if (el.n) { const w = Math.min(mw, 30 + Math.max(...el.checks.map((c) => c.length)) * 7.4); out.push(ring(mx - 4, top, w, y - top - 2)); marks.push([mx + w + 4, top, el.n]); }
      y += 8;
    } else if (el.chips) {
      let x = mx;
      const top = y;
      for (const c of el.chips) {
        const cw = 18 + c.length * 6.8;
        if (x + cw > mx + mw) { x = mx; y += 30; }
        out.push(`<rect x="${x}" y="${y}" width="${cw}" height="24" rx="12" fill="#e8eefc"/>`, t(x + 9, y + 16, c, { size: 11.5, fill: accent }));
        x += cw + 6;
      }
      y += 30;
      if (el.n) { out.push(ring(mx - 4, top - 2, mw + 4, y - top - 2)); marks.push([mx + mw + 6, top - 2, el.n]); }
      y += 6;
    } else if (el.cards) {
      const cw = (Math.min(mw, 540) - (el.cards.length - 1) * 12) / el.cards.length;
      el.cards.forEach((c, i) => {
        const cx = mx + i * (cw + 12);
        const ci = typeof c === "string" ? { t: c } : c;
        out.push(`<rect x="${cx}" y="${y}" width="${cw}" height="70" rx="10" fill="${C.side}" stroke="${C.line}"/>`, `<rect x="${cx + 12}" y="${y + 12}" width="22" height="22" rx="6" fill="${ci.n ? accent : C.line}"/>`, t(cx + 12, y + 56, ci.t, { size: 12, bold: true }));
        if (ci.n) { out.push(ring(cx, y, cw, 70, 10)); marks.push([cx + cw - 4, y - 2, ci.n]); }
      });
      y += 84;
    } else if (el.note) { out.push(t(mx, y + 14, el.note, { size: 11.5, fill: C.soft })); y += 24; }
  }
  return { svg: out.join(""), marks, used: Math.max(y, sideEnd) - py + 16 };
}

/** Uma tela de celular (aplicativo do Instagram). */
function phone(px, py, W, H, s) {
  const out = [];
  const marks = [];
  out.push(`<rect x="${px}" y="${py}" width="${W}" height="${H}" rx="26" fill="#111827"/>`, `<rect x="${px + 8}" y="${py + 8}" width="${W - 16}" height="${H - 16}" rx="20" fill="#fff"/>`);
  out.push(`<rect x="${px + W / 2 - 30}" y="${py + 14}" width="60" height="8" rx="4" fill="#111827"/>`);
  const ix = px + 20;
  const iw = W - 40;
  let y = py + 36;
  const tl = wrap(s.title, iw - (s.menu ? 40 : 0), 14);
  tl.forEach((l, i) => out.push(t(ix, y + 16 + i * 18, l, { size: 14, bold: true })));
  y += (tl.length - 1) * 18;
  if (s.menu) {
    const mx = px + W - 40;
    out.push(`<g stroke="${C.text}" stroke-width="2.2"><line x1="${mx}" y1="${y + 6}" x2="${mx + 18}" y2="${y + 6}"/><line x1="${mx}" y1="${y + 12}" x2="${mx + 18}" y2="${y + 12}"/><line x1="${mx}" y1="${y + 18}" x2="${mx + 18}" y2="${y + 18}"/></g>`);
    if (s.menu.n) { out.push(ring(mx - 4, y, 26, 24)); marks.push([mx - 14, y + 30, s.menu.n]); }
  }
  y += 34;
  if (s.profile) {
    out.push(`<circle cx="${ix + 30}" cy="${y + 30}" r="28" fill="url(#ig)"/>`, lines(ix + 72, y + 14, iw - 80, 3));
    y += 76;
    out.push(lines(ix, y, iw, 2));
    y += 40;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push(`<rect x="${ix + c * ((iw - 8) / 3 + 4)}" y="${y + r * 64}" width="${(iw - 8) / 3}" height="60" fill="${C.line}"/>`);
  }
  for (const it of s.rows || []) {
    if (it.section) { out.push(t(ix, y + 14, it.section, { size: 11, bold: true, fill: C.soft })); y += 24; continue; }
    const ls = wrap(it.t, iw - 30, 12.5);
    const h = 20 + ls.length * 16;
    if (it.n) out.push(`<rect x="${ix - 6}" y="${y}" width="${iw + 12}" height="${h}" rx="8" fill="#fde8f1"/>`);
    out.push(`<circle cx="${ix + 9}" cy="${y + h / 2}" r="8" fill="none" stroke="${C.soft}" stroke-width="1.6"/>`);
    ls.forEach((l, i) => out.push(t(ix + 26, y + 22 + i * 16, l, { size: 12.5, bold: Boolean(it.n) })));
    if (it.n) { out.push(ring(ix - 6, y, iw + 12, h)); marks.push([ix + iw + 4, y - 4, it.n]); }
    y += h + 6;
  }
  if (s.btn) {
    const by = py + H - 110;
    out.push(`<rect x="${ix}" y="${by}" width="${iw}" height="38" rx="9" fill="${C.blue}"/>`, t(ix + iw / 2, by + 24, s.btn.t, { size: 13, bold: true, fill: "#fff", anchor: "middle" }));
    if (s.btn.n) { out.push(ring(ix, by, iw, 38)); marks.push([ix + iw + 2, by - 6, s.btn.n]); }
  }
  if (s.nav) {
    const ny = py + H - 56;
    out.push(`<rect x="${px + 8}" y="${ny - 8}" width="${W - 16}" height="1" fill="${C.line}"/>`);
    const step = (W - 40) / 5;
    for (let i = 0; i < 5; i++) {
      const cx = px + 20 + step * i + step / 2;
      if (i === 4) out.push(`<circle cx="${cx}" cy="${ny + 14}" r="11" fill="url(#ig)"/>`);
      else out.push(`<rect x="${cx - 9}" y="${ny + 5}" width="18" height="18" rx="5" fill="none" stroke="${C.text}" stroke-width="2"/>`);
      if (i === 4 && s.nav.n) { out.push(ring(cx - 12, ny + 2, 24, 24, 12)); marks.push([cx - 4, ny - 18, s.nav.n]); }
    }
  }
  return { svg: out.join(""), marks };
}

function drawing(spec) {
  const panels = spec.panels;
  const kind = spec.frame || "browser";
  const pw = kind === "phone" ? 240 : panels.length > 1 ? 470 : 940;
  let ph = kind === "phone" ? 470 : 2000;
  if (kind !== "phone") ph = Math.max(300, ...panels.map((p) => browser(0, 0, pw, 2000, { ...spec, ...p }).used));
  const gap = 20;
  const W = panels.length * pw + (panels.length - 1) * gap + 40;
  const top = panels.length > 1 ? 64 : 46;
  const H = ph + top + 20;
  const parts = [];
  const marks = [];
  panels.forEach((p, i) => {
    const x = 20 + i * (pw + gap);
    const r = (kind === "phone" ? phone : browser)(x, top, pw, ph, { ...spec, ...p });
    parts.push(r.svg);
    marks.push(...r.marks);
    if (panels.length > 1) parts.push(t(x + pw / 2, 54, p.caption || `Tela ${i + 1}`, { size: 12, fill: C.soft, anchor: "middle", bold: true }));
  });
  const nums = marks.map((m) => m[2]);
  const ribbon = `<g><rect x="20" y="10" width="${W - 40}" height="24" rx="6" fill="#fef3c7" stroke="#f59e0b"/>${t(32, 27, `DESENHO ILUSTRATIVO de ${spec.place}: a tela real pode ter outro visual e outros nomes. Siga os números.`, { size: 12, bold: true, fill: "#92400e" })}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`Desenho ilustrativo: ${spec.place}, ${spec.alt}`)}" data-passos="${Math.max(...nums)}">
<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.15"/></filter><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset="0.5" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="${C.bg}"/>${ribbon}${parts.join("")}${marks.map(([x, y, n]) => badge(x, y, n)).join("")}
</svg>
`;
  return { svg, nums };
}

// Cada desenho: os números seguem o "caminho" do bloco :::fora do artigo (o teste confere).
export const DRAWINGS = [
  {
    id: "instagram-profissional", place: "aplicativo do Instagram", alt: "trocar para conta profissional", frame: "phone",
    panels: [
      { caption: "Seu perfil", title: "suaconta", menu: { n: 2 }, profile: true, nav: { n: 1 } },
      { caption: "Configurações e atividade", title: "Configurações e atividade", rows: [{ t: "Central de contas" }, { t: "Notificações" }, { section: "Para profissionais" }, { t: "Tipo de conta e ferramentas", n: 3 }, { t: "Privacidade da conta" }] },
      { caption: "Tipo de conta", title: "Tipo de conta e ferramentas", rows: [{ t: "Mudar para conta profissional", n: 4 }, { t: "Verificação" }] },
      { caption: "Escolha o tipo", title: "Que tipo de conta?", rows: [{ t: "Criador de conteúdo", n: 5 }, { t: "Empresa" }], btn: { t: "Avançar", n: 6 } },
    ],
  },
  {
    id: "facebook-pagina-instagram", place: "Facebook (Página)", alt: "ligar o Instagram à Página",
    panels: [
      { caption: "facebook.com", url: "facebook.com", brand: "Facebook", top: { t: "● Sua foto ▾", n: 1 }, main: [{ p: 3 }, { btn: "Ver todas as Páginas", ghost: true, n: 2, right: true }, { btn: "Configurações e privacidade", ghost: true, right: true }, { p: 4 }] },
      { caption: "Página › Configurações", url: "facebook.com/settings", brand: "Facebook", side: [{ section: "Permissões" }, { t: "Acesso à Página" }, { t: "Contas vinculadas", n: 6 }, { t: "Novas experiências" }], main: [{ h: "Contas vinculadas" }, { p: 2 }, { row: "Instagram", dot: C.ig, n: 7 }, { btn: "Conectar conta", n: 8 }] },
    ],
  },
  {
    id: "meta-dev-token-instagram", place: "Meta for Developers", alt: "gerar o token do Instagram",
    panels: [{ url: "developers.facebook.com/apps", brand: "Meta for Developers", topLeft: { t: "Seu app ▾", n: 2 }, top: { t: "Meus apps", n: 1 },
      side: [{ t: "Painel" }, { t: "Configurações do app" }, { t: "Instagram", n: 3 }, { t: "API setup with Instagram business login", indent: true, n: 4 }, { t: "Análise do app" }],
      main: [{ h: "Generate access tokens" }, { p: 2 }, { row: "@suaconta", dot: C.ig, btn2: "Generate token", n: 5 }, { note: "Entre com o Instagram e aceite as permissões (passo 6)." }, { field: "Token (começa com IG)", value: "IGAA•••••••••••••••••••••••", copy: true, n: 7 }] }],
  },
  {
    id: "meta-graph-explorer", place: "Explorador da Graph API", alt: "gerar o token com as permissões de anúncios",
    panels: [{ url: "developers.facebook.com/tools/explorer", brand: "Graph API Explorer",
      side: [{ section: "Consulta" }, { t: "GET  me?fields=id,name" }, { t: "Enviar" }],
      main: [{ field: "Meta App", value: "Seu app ▾", w: 300, n: 1 }, { field: "User or Page", value: "User Token ▾", w: 300 }, { h: "Permissions" }, { chips: ["ads_read", "instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"], n: 2 }, { btn: "Generate Access Token", n: 3 }, { field: "Access Token (começa com EAA)", value: "EAAB•••••••••••••••••••••••", copy: true, n: 5 }] }],
  },
  {
    id: "meta-graph-explorer-pagina", place: "Explorador da Graph API", alt: "gerar o token da Página para os formulários",
    panels: [{ url: "developers.facebook.com/tools/explorer", brand: "Graph API Explorer",
      side: [{ section: "Consulta" }, { t: "GET  me/accounts" }, { t: "Enviar" }],
      main: [{ field: "Meta App", value: "Seu app ▾", w: 300, n: 1 }, { h: "Permissions" }, { chips: ["leads_retrieval", "pages_manage_metadata", "pages_show_list", "pages_read_engagement", "ads_management"], n: 2 }, { btn: "Generate Access Token", n: 3 }, { field: "User or Page", value: "Sua Página ▾", w: 300, n: 4 }, { field: "Access Token da Página", value: "EAAB•••••••••••••••••••••••", copy: true, n: 5 }] }],
  },
  {
    id: "meta-business-conta-anuncio", place: "Configurações do negócio (Meta Business)", alt: "achar o número da conta de anúncio",
    panels: [{ url: "business.facebook.com/settings", brand: "Configurações do negócio", topLeft: { t: "Seu portfólio ▾", n: 1 },
      side: [{ t: "Usuários" }, { t: "Contas", n: 2 }, { t: "Páginas", indent: true }, { t: "Contas de anúncios", indent: true, n: 3 }, { t: "Contas do Instagram", indent: true }],
      main: [{ h: "Contas de anúncios" }, { row: "Conta principal", dot: C.blue, n: 4 }, { row: "Outra conta" }, { field: "Identificação da conta", value: "1234567890123456", w: 320, copy: true, n: 5 }] }],
  },
  {
    id: "meta-dev-webhook-instagram", place: "Meta for Developers", alt: "configurar o webhook do Instagram",
    panels: [{ url: "developers.facebook.com/apps", brand: "Meta for Developers", topLeft: { t: "Seu app ▾", n: 1 },
      side: [{ t: "Painel" }, { t: "Instagram", n: 2 }, { t: "API setup with Instagram business login", indent: true, active: true }, { t: "Análise do app" }],
      main: [{ h: "Configure webhooks", }, { note: "(passo 3: seção de webhooks da página do Instagram)" }, { field: "Callback URL", value: "https://contenthub.vinculodigital.com.br/api/instagram/webhook", n: 4 }, { field: "Verify token", value: "o mesmo de IG_WEBHOOK_VERIFY_TOKEN", n: 5 }, { btn: "Verify and save", n: 6 }, { checks: ["comments", "messages", "messaging_postbacks"], n: 7 }] }],
  },
  {
    id: "meta-verificacao-empresa", place: "Meta for Developers e Meta Business", alt: "verificar a empresa dona do app",
    panels: [
      { caption: "developers.facebook.com", url: "developers.facebook.com/apps", brand: "Meta for Developers", side: [{ t: "Painel" }, { t: "Configurações do app", n: 1 }, { t: "Básico", indent: true, n: 2 }, { t: "Avançado", indent: true }], main: [{ h: "Básico" }, { field: "Portfólio empresarial", value: "Sua empresa", w: 240 }, { p: 3 }] },
      { caption: "business.facebook.com", url: "business.facebook.com/settings", brand: "Meta Business", side: [{ t: "Usuários" }, { t: "Contas" }, { t: "Central de Segurança", n: 3 }], main: [{ h: "Verificação da empresa" }, { p: 3 }, { btn: "Iniciar verificação", n: 4 }] },
    ],
  },
  {
    id: "meta-dev-app-review", place: "Meta for Developers", alt: "pedir acesso avançado na análise do app",
    panels: [{ url: "developers.facebook.com/apps", brand: "Meta for Developers", top: { t: "Modo do app: Desenvolvimento | Ao vivo", n: 4 },
      side: [{ t: "Painel" }, { t: "Instagram" }, { t: "Análise do app", n: 1 }, { t: "Permissões e recursos", indent: true, n: 2 }, { t: "Solicitações", indent: true }],
      main: [{ h: "Permissões e recursos" }, { row: "instagram_business_basic", btn2: "Solicitar acesso avançado", n: 3 }, { row: "instagram_business_manage_comments", btn2: "Solicitar acesso avançado" }, { row: "instagram_business_manage_messages", btn2: "Solicitar acesso avançado" }, { note: "Para cada uma: explique o uso e envie o vídeo (screencast)." }] }],
  },
  {
    id: "meta-dev-webhook-leadgen", place: "Meta for Developers", alt: "assinar o leadgen da Página",
    panels: [{ url: "developers.facebook.com/apps", brand: "Meta for Developers", topLeft: { t: "Seu app ▾", n: 1 },
      side: [{ t: "Painel" }, { t: "Webhooks", n: 2 }, { t: "Instagram" }, { t: "Análise do app" }],
      main: [{ h: "Webhooks" }, { field: "Objeto", value: "Page ▾", w: 220, n: 3 }, { field: "Callback URL", value: "https://.../api/crm/lead-ads/webhook", n: 4 }, { field: "Verify token", value: "o mesmo de LEAD_ADS_VERIFY_TOKEN", n: 5 }, { btn: "Verify and save", n: 6 }, { row: "leadgen", btn2: "Assinar", n: 7 }] }],
  },
  {
    id: "facebook-pagina-id", place: "Facebook (Página)", alt: "achar o id da Página",
    panels: [{ url: "facebook.com/suapagina", brand: "Facebook", main: [{ h: "Sua Página" }, { tabs: ["Publicações", "Sobre", "Menções", "Fotos"], active: 1, n: 2 }, { row: "Transparência da Página", n: 3 }, { field: "ID da Página", value: "100012345678901", w: 300, copy: true, n: 4 }, { p: 2 }], side: [{ t: "Sua Página", n: 1 }, { t: "Feed" }, { t: "Mensagens" }] }],
  },
  {
    id: "meta-eventos-capi", place: "Gerenciador de Eventos da Meta", alt: "gerar o token da API de Conversões",
    panels: [{ url: "business.facebook.com/events_manager2", brand: "Gerenciador de Eventos",
      side: [{ t: "Fontes de dados", n: 1 }, { t: "Pixel do site", indent: true, n: 2 }, { t: "Outro pixel", indent: true }, { t: "Conversões personalizadas" }],
      main: [{ tabs: ["Visão geral", "Testar eventos", "Diagnóstico", "Configurações"], active: 3, n: 3 }, { field: "Identificação do pixel", value: "123456789012345", w: 300, copy: true }, { h: "API de Conversões" }, { p: 2 }, { btn: "Gerar token de acesso", n: 4 }, { field: "Token de acesso", value: "EAAB•••••••••••••••••••••••", copy: true, n: 5 }] }],
  },
  {
    id: "hotmart-webhook", place: "Hotmart", alt: "cadastrar o webhook de vendas", accent: C.hot,
    panels: [{ url: "app.hotmart.com", brand: "Hotmart",
      side: [{ t: "Painel" }, { t: "Produtos" }, { t: "Vendas" }, { t: "Ferramentas", n: 1 }, { t: "Webhook", indent: true, n: 2 }],
      main: [{ tabs: ["Configurações", "Autenticação", "Histórico"], active: 0, n: 6, nAt: 1 }, { btn: "Cadastrar Webhook", n: 3 }, { field: "URL para envio dos dados", value: "https://contenthub.vinculodigital.com.br/api/vendas/hotmart/…", n: 4 }, { checks: ["Compra aprovada", "Compra reembolsada", "Chargeback", "Abandono de carrinho"], n: 5 }, { field: "Hottok (aba Autenticação)", value: "••••••••••••••••", w: 320, copy: true }] }],
  },
  {
    id: "kiwify-webhook", place: "Kiwify", alt: "criar o webhook de vendas", accent: C.kiwi,
    panels: [{ url: "dashboard.kiwify.com.br", brand: "Kiwify",
      side: [{ t: "Dashboard" }, { t: "Produtos" }, { t: "Vendas" }, { t: "Apps", n: 1 }],
      main: [{ cards: ["Integrações", { t: "Webhooks", n: 2 }, "API"] }, { btn: "Criar Webhook", n: 3 }, { field: "URL do webhook", value: "https://contenthub.vinculodigital.com.br/api/vendas/kiwify/…", n: 4 }, { checks: ["Compra aprovada", "Compra reembolsada", "Chargeback", "Carrinho abandonado"], n: 5 }, { field: "Token", value: "••••••••••••", w: 300, copy: true, n: 6 }] }],
  },
  {
    id: "google-cloud-chave", place: "Console do Google Cloud", alt: "criar a chave de API do YouTube", accent: C.g,
    panels: [{ url: "console.cloud.google.com", brand: "Google Cloud", topLeft: { t: "Seu projeto ▾", n: 1 },
      side: [{ t: "APIs e serviços", n: 2 }, { t: "APIs ativadas", indent: true }, { t: "Biblioteca", indent: true, n: 3 }, { t: "Credenciais", indent: true, n: 4 }],
      main: [{ h: "Credenciais" }, { btn: "+ Criar credenciais", n: 5, menu: ["Chave de API", "ID do cliente OAuth", "Conta de serviço"] }, { field: "Sua chave de API (começa com AIza)", value: "AIzaSy•••••••••••••••••••", copy: true, n: 6 }] }],
  },
  {
    id: "pexels-api", place: "Pexels", alt: "pedir a chave da API", accent: "#05a081",
    panels: [{ url: "pexels.com/api", brand: "Pexels", top: { t: "Entrar", n: 1 },
      main: [{ h: "Pexels API" }, { p: 3 }, { btn: "Your API Key", n: 2 }, { field: "Your API Key", value: "••••••••••••••••••••••••", copy: true, n: 3 }] }],
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(outDir, { recursive: true });
  for (const d of DRAWINGS) {
    const { svg, nums } = drawing(d);
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    if (sorted.length !== nums.length) throw new Error(`${d.id}: número repetido`);
    writeFileSync(path.join(outDir, `${d.id}.svg`), svg);
    console.log(`${d.id}.svg passos ${sorted.join(",")}`);
  }
}
