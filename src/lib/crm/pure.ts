// Peças puras do CRM (sem banco): rótulos de origem, normalização, UTM, CSV e etapas padrão.
// Arquivo puro de propósito: serve à tela, às rotas e aos testes.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const SOURCE_KINDS = ["automation", "comment", "dm", "postback", "meta_lead_ads", "ig_ad", "ig_link", "link", "landing", "manual", "import", "sale"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_PT: Record<string, string> = {
  automation: "Automação do direct",
  comment: "Comentário",
  dm: "Direct",
  postback: "Botão no direct",
  meta_lead_ads: "Formulário da Meta",
  ig_ad: "Anúncio para o direct",
  ig_link: "Link ig.me",
  link: "Link rastreado",
  landing: "Página de captura",
  manual: "Cadastro à mão",
  import: "Planilha",
  sale: "Venda (checkout)",
};

export interface StageDef { key: string; name: string; kind: "open" | "won" | "lost"; color?: string }

export const DEFAULT_STAGES: StageDef[] = [
  { key: "novo", name: "Novo", kind: "open", color: "#38bdf8" },
  { key: "em-conversa", name: "Em conversa", kind: "open", color: "#a78bfa" },
  { key: "proposta", name: "Proposta", kind: "open", color: "#f59e0b" },
  { key: "ganhou", name: "Ganhou", kind: "won", color: "#22c55e" },
  { key: "perdeu", name: "Perdeu", kind: "lost", color: "#6b7280" },
];

export const LIMITS = { stages: 12, stageName: 30, pipelines: 10, note: 2000, task: 200, name: 120, tag: 30, tags: 30, fields: 30, fieldValue: 300, lostReason: 200, importRows: 5000, importBytes: 2 * 1024 * 1024 };

export function slugKey(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function normEmail(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v.length > 254) return null;
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? v : null;
}

/**
 * Telefone: devolve { phone (como guardar), key (para achar duplicado) }.
 * Brasil (10/11 dígitos, com ou sem 55) vira +55DDNNNNNNNNN; de fora, com "+" e 8 a 15 dígitos, fica como veio.
 */
export function normPhone(raw: unknown): { phone: string; key: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) {
    const ddd = Number(d.slice(0, 2));
    if (ddd < 11 || ddd > 99) return null;
    // celular de 11 dígitos começa com 9; o de 10 (antigo) ganha o 9 para casar com o novo
    if (d.length === 11 && d[2] !== "9") return null;
    const key = d.length === 10 && /[6-9]/.test(d[2]) ? `${d.slice(0, 2)}9${d.slice(2)}` : d;
    return { phone: `+55${d}`, key };
  }
  if (s.startsWith("+") && d.length >= 8 && d.length <= 15) return { phone: `+${d}`, key: d };
  return null;
}

export const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Lê utm_* de um objeto (corpo) ou de uma URL; corta tamanho e descarta vazio. */
export function pickUtm(from: Record<string, unknown> | URLSearchParams | null | undefined): Utm {
  const out: Utm = {};
  if (!from) return out;
  for (const k of UTM_KEYS) {
    const raw = from instanceof URLSearchParams ? from.get(`utm_${k}`) : (from[`utm_${k}`] ?? (from as any)[k]);
    const v = String(raw ?? "").trim().slice(0, 120);
    if (v) out[k] = v;
  }
  return out;
}
export const hasUtm = (u: Utm | null | undefined) => Boolean(u && UTM_KEYS.some((k) => u[k]));

/** Lê as UTMs de dentro de uma URL completa (a página de onde o formulário foi enviado). */
export function utmFromUrl(url: unknown): Utm {
  try {
    return pickUtm(new URL(String(url || "")).searchParams);
  } catch {
    return {};
  }
}

const tagRe = /^[\p{L}\p{N} _.-]{1,30}$/u;
export function cleanTags(v: unknown): string[] {
  const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((s) => String(s ?? "").trim().replace(/^#/, "")).filter(Boolean);
  return [...new Set(list.filter((t) => tagRe.test(t)))].slice(0, LIMITS.tags);
}

export function fieldKey(raw: unknown): string {
  return slugKey(String(raw ?? "")).replace(/-/g, "_").slice(0, 30);
}

// ---------- CSV (RFC 4180 simples: aspas, vírgula ou ponto e vírgula) ----------

export function detectDelimiter(firstLine: string): string {
  const count = (c: string) => firstLine.split(c).length - 1;
  return count(";") > count(",") ? ";" : count("\t") > count(",") ? "\t" : ",";
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = detectDelimiter(src.split(/\r?\n/, 1)[0] || "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // planilha não executa fórmula
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (head: string[], rows: unknown[][]) => "﻿" + [head.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");

/** Sugere o destino de cada coluna da planilha pelo nome do cabeçalho. */
export function guessMapping(header: string[]): string[] {
  return header.map((h) => {
    const k = slugKey(h);
    if (/^(nome|name|full-name|nome-completo|cliente)$/.test(k)) return "name";
    if (/(e-?mail)/.test(k)) return "email";
    if (/(telefone|celular|whats|phone|fone)/.test(k)) return "phone";
    if (/^(instagram|ig|usuario|arroba|username)$/.test(k)) return "username";
    if (/^(etiquetas?|tags?)$/.test(k)) return "tags";
    if (/^(valor|value|ticket)$/.test(k)) return "value";
    if (/^(etapa|stage|status)$/.test(k)) return "stage";
    const utm = /^utm-(source|medium|campaign|term|content)$/.exec(k);
    if (utm) return `utm_${utm[1]}`;
    return k ? `field:${fieldKey(h)}` : "ignore";
  });
}

/** Número em reais escrito à brasileira ou não ("1.234,56", "1234.56", "R$ 97"). */
export function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  let s = String(raw).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}

/** Campo do formulário da Meta -> destino padrão (quando a Página não tem mapa próprio). */
export function defaultLeadField(name: string): string {
  const k = slugKey(name).replace(/-/g, "_");
  if (k === "full_name" || k === "nome_completo" || k === "nome") return "name";
  if (k === "first_name") return "first_name";
  if (k === "last_name") return "last_name";
  if (k === "email" || k === "e_mail") return "email";
  if (k === "phone_number" || k === "telefone" || k === "celular" || k === "whatsapp") return "phone";
  return `field:${fieldKey(name)}`;
}

/** Monta nome, e-mail, telefone e campos a partir do field_data da Meta e do mapa da Página. */
export function mapLeadFields(fieldData: { name?: string; values?: unknown[] }[], map: Record<string, string> = {}) {
  const out = { name: "", first: "", last: "", email: "", phone: "", fields: {} as Record<string, string> };
  for (const f of Array.isArray(fieldData) ? fieldData : []) {
    const name = String(f?.name ?? "").slice(0, 100);
    if (!name) continue;
    const value = (Array.isArray(f.values) ? f.values : []).map((v) => String(v ?? "")).join(", ").slice(0, LIMITS.fieldValue);
    const dest = map[name] || defaultLeadField(name);
    if (dest === "ignore") continue;
    if (dest === "name") out.name = value;
    else if (dest === "first_name") out.first = value;
    else if (dest === "last_name") out.last = value;
    else if (dest === "email") out.email = value;
    else if (dest === "phone") out.phone = value;
    else if (dest.startsWith("field:")) {
      const key = fieldKey(dest.slice(6));
      if (key && Object.keys(out.fields).length < LIMITS.fields) out.fields[key] = value;
    }
  }
  if (!out.name) out.name = [out.first, out.last].filter(Boolean).join(" ");
  return { name: out.name.slice(0, LIMITS.name), email: out.email, phone: out.phone, fields: out.fields };
}

export const fmtMoney = (v: number | null | undefined) =>
  v == null ? "–" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
