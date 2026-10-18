// REEL COM CENAS: o que serve à tela e ao servidor (arquivo puro, sem banco).
// - vozes (edge-tts, conferidas na lista da Microsoft em 18/10/2026);
// - licenças aceitas na biblioteca de cenas;
// - PADRÃO DE VÍDEO: os campos, os limites, a conferência e a tradução para o "tema" que o motor
//   (estudio/cenas.py) recebe. Os padrões "HDMOJ v2" e "JNG v2" reproduzem, campo a campo, os temas
//   aprovados em /root/viral_canais/_build/theme_*.json (o teste confere a igualdade).

/* eslint-disable @typescript-eslint/no-explicit-any */

export const VOICES = [
  { id: "pt-BR-AntonioNeural", label: "Antonio (português do Brasil, masculina)", lang: "pt-BR" },
  { id: "pt-BR-FranciscaNeural", label: "Francisca (português do Brasil, feminina)", lang: "pt-BR" },
  { id: "pt-BR-ThalitaMultilingualNeural", label: "Thalita (português do Brasil, feminina)", lang: "pt-BR" },
  { id: "pt-PT-DuarteNeural", label: "Duarte (português de Portugal, masculina)", lang: "pt-PT" },
  { id: "pt-PT-RaquelNeural", label: "Raquel (português de Portugal, feminina)", lang: "pt-PT" },
  { id: "es-MX-JorgeNeural", label: "Jorge (espanhol do México, masculina)", lang: "es-MX" },
  { id: "es-MX-DaliaNeural", label: "Dalia (espanhol do México, feminina)", lang: "es-MX" },
  { id: "es-US-AlonsoNeural", label: "Alonso (espanhol dos EUA, masculina)", lang: "es-US" },
  { id: "es-US-PalomaNeural", label: "Paloma (espanhol dos EUA, feminina)", lang: "es-US" },
  { id: "es-ES-AlvaroNeural", label: "Álvaro (espanhol da Espanha, masculina)", lang: "es-ES" },
  { id: "es-ES-ElviraNeural", label: "Elvira (espanhol da Espanha, feminina)", lang: "es-ES" },
  { id: "en-US-GuyNeural", label: "Guy (inglês dos EUA, masculina)", lang: "en-US" },
  { id: "en-US-JennyNeural", label: "Jenny (inglês dos EUA, feminina)", lang: "en-US" },
  { id: "en-US-AndrewNeural", label: "Andrew (inglês dos EUA, masculina)", lang: "en-US" },
  { id: "en-US-AvaNeural", label: "Ava (inglês dos EUA, feminina)", lang: "en-US" },
] as const;
export const voiceOf = (id: string) => VOICES.find((v) => v.id === id) || null;
export const LANG_LABEL: Record<string, string> = { "pt-BR": "português do Brasil", "pt-PT": "português de Portugal", "es-MX": "espanhol do México", "es-US": "espanhol neutro", "es-ES": "espanhol da Espanha", "en-US": "inglês dos EUA" };

export const LICENSES = [
  { id: "proprio", label: "Gravação própria (a marca é dona)", needsUrl: false },
  { id: "mixkit", label: "Mixkit Stock Video Free License", needsUrl: true },
  { id: "pexels", label: "Pexels License", needsUrl: true },
  { id: "cc0", label: "CC0 (domínio público dedicado)", needsUrl: true },
  { id: "pd", label: "Domínio público", needsUrl: true },
  { id: "ccby", label: "CC BY (com crédito ao autor)", needsUrl: true },
  { id: "comprada", label: "Licença comprada (banco pago)", needsUrl: true },
] as const;
export const licenseOf = (id: string) => LICENSES.find((l) => l.id === id) || null;

export const SUGGESTED_CATEGORIES = ["cidade", "mar/praia", "rio", "floresta", "estrada", "montanha", "nascer do sol", "pessoas", "tempo", "céu/luz", "nuvens", "igreja", "velas", "Bíblia", "natureza"];
export const normCategory = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30);

/** Estrutura do roteiro: gancho, N pontos e chamada final. */
export const STRUCTURES = {
  gancho_pontos_cta: { label: "Gancho, pontos e chamada" },
  gancho_lista_cta: { label: "Gancho, lista numerada e chamada" },
  versiculo: { label: "Gancho, versículo ou frase-chave, reflexão e chamada" },
} as const;
export type Structure = keyof typeof STRUCTURES;

/** Fontes dentro da imagem do app (SIL OFL 1.1) e os pesos que cada uma tem. */
export const REEL_FONTS: Record<string, { label: string; vars: string[] }> = {
  "Montserrat-wght.ttf": { label: "Montserrat", vars: ["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"] },
  "Manrope-wght.ttf": { label: "Manrope", vars: ["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"] },
  "CormorantGaramond-wght.ttf": { label: "Cormorant Garamond", vars: ["Light", "Regular", "Medium", "SemiBold", "Bold"] },
};
const WEIGHTS = ["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"];
/** O peso pedido, ou o mais próximo que a fonte tem (Manrope não tem Black: vira ExtraBold). */
export function varFor(fontFile: string, want: string): string {
  const vars = REEL_FONTS[fontFile]?.vars || WEIGHTS;
  if (vars.includes(want)) return want;
  const w = WEIGHTS.indexOf(want);
  return [...vars].sort((a, b) => Math.abs(WEIGHTS.indexOf(a) - w) - Math.abs(WEIGHTS.indexOf(b) - w) || WEIGHTS.indexOf(b) - WEIGHTS.indexOf(a))[0];
}

// ---------------- temas de base (cópia fiel dos temas aprovados)
type RGB = [number, number, number];
const st = (font: string, v: string, size: number, color: RGB, hl: RGB, lh: number, extra: Record<string, unknown> = {}) => ({ font, var: v, size, color, hl, lh, ...extra });
const M = "Montserrat-wght.ttf";
const MR = "Manrope-wght.ttf";
const CG = "CormorantGaramond-wght.ttf";
export const PRESETS: Record<"impacto" | "sereno", any> = {
  impacto: {
    voice: "pt-BR-AntonioNeural", rate: "-4%", pitch: "-6Hz", pad: [110, 164.81, 220, 261.63], pad_vol: 0.3, bar: [245, 197, 24], gap: 50,
    brand: { text: "", font: M, var: "SemiBold", size: 30, color: [245, 197, 24], rule: true },
    handle: { text: "", font: M, var: "Medium", size: 32, color: [150, 150, 150] },
    styles: {
      hook: st(M, "Black", 112, [255, 255, 255], [245, 197, 24], 1.12, { upper: true, shadow: true }),
      body: st(M, "Bold", 74, [245, 245, 245], [245, 197, 24], 1.22, { shadow: true }),
      big: st(M, "ExtraBold", 92, [255, 255, 255], [245, 197, 24], 1.15, { shadow: true }),
      num: st(M, "Black", 170, [245, 197, 24], [245, 197, 24], 1.0),
      small: st(M, "Medium", 50, [200, 200, 200], [245, 197, 24], 1.3),
      cta: st(M, "ExtraBold", 66, [255, 255, 255], [245, 197, 24], 1.22),
    },
    cap: { font: M, var: "Black", size: 104, color: [255, 255, 255], hl: [245, 197, 24], lh: 1.12, upper: true, stroke: 7, max_words: 3 },
    grade: { dim: 0.62, top: 0.5, bottom: 0.6, tint: [1.0, 0.96, 0.88] },
    zoom: [1.0, 1.09],
    card_boost: { cta: 1.45, small: 1.3, big: 1.15 },
  },
  sereno: {
    voice: "es-MX-JorgeNeural", rate: "-6%", pitch: "-2Hz", pad: [146.83, 220, 293.66, 369.99], pad_vol: 0.32, bar: [216, 178, 106], gap: 46,
    brand: { text: "", font: MR, var: "SemiBold", size: 30, color: [216, 178, 106], rule: true },
    handle: { text: "", font: MR, var: "Medium", size: 32, color: [170, 170, 185] },
    styles: {
      hook: st(CG, "Bold", 120, [250, 244, 232], [232, 196, 120], 1.05, { shadow: true }),
      body: st(MR, "Bold", 66, [245, 240, 230], [232, 196, 120], 1.25, { shadow: true }),
      big: st(CG, "Bold", 98, [250, 244, 232], [232, 196, 120], 1.08, { shadow: true }),
      verse: st(CG, "Bold", 78, [250, 244, 232], [232, 196, 120], 1.16, { shadow: true }),
      ref: st(MR, "SemiBold", 40, [216, 178, 106], [216, 178, 106], 1.3, { upper: true }),
      num: st(CG, "Bold", 160, [232, 196, 120], [232, 196, 120], 0.95),
      small: st(MR, "Medium", 48, [215, 210, 205], [232, 196, 120], 1.3),
      cta: st(MR, "ExtraBold", 62, [255, 255, 255], [232, 196, 120], 1.22),
    },
    cap: { font: MR, var: "ExtraBold", size: 84, color: [255, 250, 240], hl: [240, 200, 120], lh: 1.16, stroke: 6, stroke_col: [40, 25, 10], max_words: 4 },
    grade: { dim: 0.66, top: 0.45, bottom: 0.55, tint: [1.04, 0.97, 0.86] },
    zoom: [1.0, 1.06],
    card_boost: { cta: 1.45, small: 1.3, big: 1.15 },
    num_overlay: { font: MR, var: "ExtraBold", size: 150 },
  },
};
// o tema "impacto" não tem estilo de referência: usa o do sereno com a fonte dele
PRESETS.impacto.styles.ref = st(M, "SemiBold", 40, [245, 197, 24], [245, 197, 24], 1.3, { upper: true });

// ---------------- PADRÃO DE VÍDEO
export interface TemplateSettings {
  preset: "impacto" | "sereno";
  voice: { name: string; rate: number; pitch: number };
  colors: { highlight: string; captionHighlight: string; caption: string; captionStroke: string; brand: string; bar: string };
  fonts: { title: string; body: string };
  caption: { upper: boolean; maxWords: number; size: number };
  hook: { upper: boolean; size: number };
  brandText: string;
  handle: string;
  cutSeconds: number;
  categories: { name: string; weight: number }[];
  music: { on: boolean; volume: number };
  targetSeconds: number;
  ctaText: string;
  structure: { kind: Structure; points: number };
  ai: { tone: string; rules: string; forbidden: string[] };
}

export const TEMPLATE_LIMITS = { rate: [-30, 30], pitch: [-20, 20], maxWords: [1, 6], capSize: [56, 130], hookSize: [70, 150], cut: [2, 6], weight: [1, 5], categories: 12, volume: [0, 0.8], target: [12, 60], points: [1, 6], cta: 60, brand: 40, tone: 200, rules: 800, forbidden: 30 } as const;

const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
export const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const pct = (s: string) => Number(String(s).replace(/[%Hz+]/g, ""));

/** Padrão inicial a partir de um tema de base (e do kit, quando houver). */
export function defaultSettings(preset: "impacto" | "sereno" = "impacto", kit?: { accent?: string; name?: string; handle?: string }): TemplateSettings {
  const p = PRESETS[preset];
  const accent = kit?.accent && isHex(kit.accent) ? kit.accent.toUpperCase() : null;
  return {
    preset,
    voice: { name: p.voice, rate: pct(p.rate), pitch: pct(p.pitch) },
    colors: { highlight: accent || hex(p.styles.hook.hl), captionHighlight: accent || hex(p.cap.hl), caption: hex(p.cap.color), captionStroke: hex(p.cap.stroke_col || [0, 0, 0]), brand: accent || hex(p.brand.color), bar: accent || hex(p.bar) },
    fonts: { title: p.styles.hook.font, body: p.styles.body.font },
    caption: { upper: Boolean(p.cap.upper), maxWords: p.cap.max_words, size: p.cap.size },
    hook: { upper: Boolean(p.styles.hook.upper), size: p.styles.hook.size },
    brandText: "",
    handle: "",
    cutSeconds: 3.4,
    categories: [],
    music: { on: true, volume: p.pad_vol },
    targetSeconds: 30,
    ctaText: "",
    structure: { kind: "gancho_pontos_cta", points: 3 },
    ai: { tone: "", rules: "", forbidden: [] },
  };
}

export class TemplateInvalid extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join("; "));
    this.name = "TemplateInvalid";
    this.problems = problems;
  }
}

const clampNum = (v: unknown, [a, b]: readonly [number, number], dflt: number, errors: string[], what: string, step = 0.01) => {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n) || n < a || n > b) {
    errors.push(`${what}: entre ${a} e ${b}`);
    return dflt;
  }
  return Number((Math.round(n / step) * step).toFixed(2));
};
const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Confere um padrão (inteiro ou parcial, por cima de `base`) e devolve o padrão LIMPO.
 * Campo fora do limite, cor inválida, fonte ou voz desconhecida = TemplateInvalid com a lista.
 */
export function validateSettings(raw: unknown, base: TemplateSettings = defaultSettings()): TemplateSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as any;
  const e: string[] = [];
  const L = TEMPLATE_LIMITS;
  const preset = r.preset === undefined ? base.preset : r.preset === "sereno" ? "sereno" : r.preset === "impacto" ? "impacto" : (e.push("tema de base desconhecido"), base.preset);
  const voiceName = r.voice?.name === undefined ? base.voice.name : String(r.voice.name);
  if (!voiceOf(voiceName)) e.push("voz desconhecida");
  const colors = { ...base.colors };
  for (const k of Object.keys(colors) as (keyof TemplateSettings["colors"])[]) {
    const v = r.colors?.[k];
    if (v === undefined || v === "") continue;
    if (!isHex(v)) e.push(`cor ${k} inválida (use #RRGGBB)`);
    else colors[k] = v.toUpperCase();
  }
  const fonts = { ...base.fonts };
  for (const k of ["title", "body"] as const) {
    const v = r.fonts?.[k];
    if (v === undefined) continue;
    if (!REEL_FONTS[v]) e.push(`fonte ${k === "title" ? "do título" : "do texto"} desconhecida`);
    else fonts[k] = v;
  }
  let categories = base.categories;
  if (r.categories !== undefined) {
    if (!Array.isArray(r.categories)) e.push("categorias: lista inválida");
    else {
      const seen = new Set<string>();
      categories = [];
      for (const c of r.categories.slice(0, L.categories)) {
        const name = normCategory(typeof c === "string" ? c : c?.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        categories.push({ name, weight: clampNum(typeof c === "string" ? 1 : c?.weight, L.weight, 1, e, `peso de ${name}`, 1) });
      }
    }
  }
  const forbidden = r.ai?.forbidden === undefined ? base.ai.forbidden : (Array.isArray(r.ai.forbidden) ? r.ai.forbidden : String(r.ai.forbidden).split(/[,;\n]/)).map((x: unknown) => txt(x, 40)).filter(Boolean).slice(0, L.forbidden);
  const kind = r.structure?.kind === undefined ? base.structure.kind : r.structure.kind in STRUCTURES ? r.structure.kind : (e.push("estrutura desconhecida"), base.structure.kind);
  const out: TemplateSettings = {
    preset,
    voice: { name: voiceName, rate: clampNum(r.voice?.rate, L.rate, base.voice.rate, e, "velocidade da voz", 1), pitch: clampNum(r.voice?.pitch, L.pitch, base.voice.pitch, e, "tom da voz", 1) },
    colors,
    fonts,
    caption: { upper: r.caption?.upper === undefined ? base.caption.upper : Boolean(r.caption.upper), maxWords: clampNum(r.caption?.maxWords, L.maxWords, base.caption.maxWords, e, "palavras por legenda", 1), size: clampNum(r.caption?.size, L.capSize, base.caption.size, e, "tamanho da legenda", 1) },
    hook: { upper: r.hook?.upper === undefined ? base.hook.upper : Boolean(r.hook.upper), size: clampNum(r.hook?.size, L.hookSize, base.hook.size, e, "tamanho do gancho", 1) },
    brandText: r.brandText === undefined ? base.brandText : txt(r.brandText, L.brand),
    handle: r.handle === undefined ? base.handle : txt(r.handle, L.brand),
    cutSeconds: clampNum(r.cutSeconds, L.cut, base.cutSeconds, e, "intervalo entre cortes", 0.1),
    categories,
    music: { on: r.music?.on === undefined ? base.music.on : Boolean(r.music.on), volume: clampNum(r.music?.volume, L.volume, base.music.volume, e, "volume da trilha") },
    targetSeconds: clampNum(r.targetSeconds, L.target, base.targetSeconds, e, "duração alvo", 1),
    ctaText: r.ctaText === undefined ? base.ctaText : txt(r.ctaText, L.cta),
    structure: { kind, points: clampNum(r.structure?.points, L.points, base.structure.points, e, "quantidade de pontos", 1) },
    ai: { tone: r.ai?.tone === undefined ? base.ai.tone : txt(r.ai.tone, L.tone), rules: r.ai?.rules === undefined ? base.ai.rules : String(r.ai.rules ?? "").trim().slice(0, L.rules), forbidden },
  };
  for (const [k, v] of [["texto da marca", out.brandText], ["@", out.handle], ["chamada", out.ctaText], ["tom", out.ai.tone], ["regras", out.ai.rules], ...out.ai.forbidden.map((f) => ["palavra proibida", f])] as [string, string][])
    if (/[<>{}\\]/.test(v)) e.push(`${k}: tire os símbolos < > { } \\`);
  if (e.length) throw new TemplateInvalid(e);
  return out;
}

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;
const fmtHz = (n: number) => `${n >= 0 ? "+" : ""}${n}Hz`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * O tema completo que o motor recebe. `kit` dá o texto da marca e o @ quando o padrão deixa em branco.
 * Mantém tamanhos, entrelinhas, escurecimento e zoom do tema de base: o padrão só mexe no que expõe.
 */
export function buildLook(s: TemplateSettings, kit: { name?: string; handle?: string } = {}): any {
  const t = clone(PRESETS[s.preset]);
  const base = PRESETS[s.preset];
  t.voice = s.voice.name;
  t.rate = fmtPct(s.voice.rate);
  t.pitch = fmtHz(s.voice.pitch);
  t.pad_vol = s.music.on ? s.music.volume : 0;
  t.music = s.music.on;
  t.bar = rgb(s.colors.bar);
  t.brand.text = (s.brandText || kit.name || "").toUpperCase();
  t.brand.color = rgb(s.colors.brand);
  t.handle.text = s.handle || kit.handle || "";
  const titleStyles = ["hook", "big", "num", "verse"];
  for (const [k, v] of Object.entries<any>(t.styles)) {
    const font = titleStyles.includes(k) ? s.fonts.title : s.fonts.body;
    if (font !== base.styles[k].font) v.var = varFor(font, base.styles[k].var);
    v.font = font;
    v.hl = rgb(s.colors.highlight);
    if (k === "num") v.color = rgb(s.colors.highlight);
    if (k === "ref") v.color = v.hl = rgb(s.colors.brand);
  }
  t.styles.hook.size = s.hook.size;
  if (s.hook.upper) t.styles.hook.upper = true;
  else delete t.styles.hook.upper;
  for (const part of [t.brand, t.handle]) {
    if (part.font !== s.fonts.body) part.var = varFor(s.fonts.body, part.var);
    part.font = s.fonts.body;
  }
  if (t.cap.font !== s.fonts.body) t.cap.var = varFor(s.fonts.body, base.cap.var);
  t.cap.font = s.fonts.body;
  t.cap.size = s.caption.size;
  t.cap.max_words = s.caption.maxWords;
  t.cap.color = rgb(s.colors.caption);
  t.cap.hl = rgb(s.colors.captionHighlight);
  t.cap.stroke_col = rgb(s.colors.captionStroke);
  if (s.caption.upper) t.cap.upper = true;
  else delete t.cap.upper;
  if (t.num_overlay) {
    t.num_overlay.var = varFor(s.fonts.body, t.num_overlay.var);
    t.num_overlay.font = s.fonts.body;
  }
  return t;
}

/** Quantas cenas (cartões) a estrutura pede. */
export const sceneCount = (s: TemplateSettings) => s.structure.points + 2;
export const langOf = (s: TemplateSettings) => voiceOf(s.voice.name)?.lang || "pt-BR";

/** Tempo de geração (medido no container em 18/10: vídeo de 29,7 s pronto em 163 s, ~5,3 s por segundo de vídeo). */
export const RENDER_FACTOR = 5.3;
export const etaSeconds = (videoSeconds: number, ahead = 0) => Math.round(15 + videoSeconds * RENDER_FACTOR + ahead);
export const fmtEta = (s: number) => (s < 90 ? `cerca de ${Math.max(30, Math.round(s / 10) * 10)} segundos` : `cerca de ${Math.round(s / 60)} minutos`);

// ---------------- os dois padrões aprovados (18/10/2026), para semear a Vínculo Digital
export const SEED_TEMPLATES: { project: "hdmoj" | "jng"; name: string; settings: TemplateSettings }[] = [
  {
    project: "hdmoj",
    name: "Padrão HDMOJ v2",
    settings: {
      ...defaultSettings("impacto"),
      brandText: "HORA DE MUDAR O JOGO", handle: "@horademudarojogo",
      categories: [{ name: "cidade", weight: 3 }, { name: "estrada", weight: 2 }, { name: "mar/praia", weight: 2 }, { name: "montanha", weight: 2 }, { name: "nascer do sol", weight: 1 }, { name: "rio", weight: 1 }, { name: "floresta", weight: 1 }],
      targetSeconds: 28, ctaText: "e segue o perfil",
      structure: { kind: "gancho_pontos_cta", points: 3 },
      ai: { tone: "direto, provocativo, motivacional, frases curtas, segunda pessoa (você)", rules: "Gancho que contraria uma crença comum. Um ponto por cena. A chamada final pede para comentar uma palavra curta em maiúsculas (ex.: comenta EU) e seguir o perfil.", forbidden: ["coach", "fórmula mágica", "garantido", "fique rico"] },
    },
  },
  {
    project: "jng",
    name: "Padrão JNG v2",
    settings: {
      ...defaultSettings("sereno"),
      brandText: "JESÚS NOS GUÍA", handle: "@jesusnosguia.es",
      categories: [{ name: "céu/luz", weight: 3 }, { name: "nuvens", weight: 2 }, { name: "velas", weight: 2 }, { name: "igreja", weight: 2 }, { name: "bíblia", weight: 1 }],
      targetSeconds: 30, ctaText: "sigue para más paz",
      structure: { kind: "versiculo", points: 3 },
      ai: { tone: "acolhedor, sereno, esperançoso, espanhol do México, segunda pessoa (tú)", rules: "Cite um versículo da Reina-Valera 1909 com a referência exata (livro capítulo:versículo). Não invente versículo. A chamada final convida a comentar Amén e seguir.", forbidden: ["milagre garantido", "prosperidade", "dinheiro"] },
    },
  },
];
