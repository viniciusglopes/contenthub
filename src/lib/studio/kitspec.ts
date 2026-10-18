// Especificação do kit de marca que serve ao servidor e à tela (arquivo puro).
// Fontes: só as que vão dentro da imagem do app, todas de licença livre (SIL OFL 1.1),
// baixadas de github.com/google/fonts (licenças em estudio/fontes/OFL-*.txt).

export const FONT_PAIRS: Record<string, { label: string; titulo: { arquivo: string; italico: string; peso: number }; corpo: { arquivo: string; peso: number } }> = {
  serifa: {
    label: "Serifa elegante (Cormorant Garamond + Manrope)",
    titulo: { arquivo: "CormorantGaramond-wght.ttf", italico: "CormorantGaramond-Italic-wght.ttf", peso: 600 },
    corpo: { arquivo: "Manrope-wght.ttf", peso: 500 },
  },
  impacto: {
    label: "Impacto (Montserrat)",
    titulo: { arquivo: "Montserrat-wght.ttf", italico: "Montserrat-wght.ttf", peso: 800 },
    corpo: { arquivo: "Montserrat-wght.ttf", peso: 500 },
  },
  sem_serifa: {
    label: "Sem serifa forte (Manrope)",
    titulo: { arquivo: "Manrope-wght.ttf", italico: "Manrope-wght.ttf", peso: 700 },
    corpo: { arquivo: "Manrope-wght.ttf", peso: 500 },
  },
};

export const PALETTE_FIELDS = [
  { key: "background", label: "Fundo claro" },
  { key: "text", label: "Texto e fundo escuro" },
  { key: "accent", label: "Destaque" },
  { key: "support", label: "Apoio" },
] as const;
export type Palette = Record<(typeof PALETTE_FIELDS)[number]["key"], string>;
export const DEFAULT_PALETTE: Palette = { background: "#F6F2EA", text: "#14323B", accent: "#A47C48", support: "#DCE5E2" };

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const lum = (hex: string) => {
  const f = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(1) + 0.7152 * f(3) + 0.0722 * f(5);
};
/** Contraste WCAG entre duas cores #rrggbb. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** O par principal (texto sobre fundo) precisa de 7:1 para a arte inteira ficar legível. */
export const MAIN_CONTRAST = 7;
export function paletteProblem(p: Palette): string {
  for (const f of PALETTE_FIELDS) if (!isHex(p[f.key])) return `Escolha a cor "${f.label}".`;
  const c = contrast(p.text, p.background);
  if (c < MAIN_CONTRAST) return `O texto sobre o fundo claro tem contraste ${c.toFixed(1)}:1; o mínimo é ${MAIN_CONTRAST}:1. Escureça o texto ou clareie o fundo.`;
  if (contrast(p.text, p.support) < 4.5) return "A cor de apoio está escura demais para receber o texto. Clareie o apoio.";
  return "";
}

export interface KitT {
  _id?: string;
  saved: boolean;
  project: string;
  name: string; handle: string; profession: string; registration: string; segment: string; offer: string; audience: string; city: string;
  tone: { adjectives: string[]; avoid: string[] };
  palette: Palette;
  fontPair: string;
  sector: string;
  logo: { _id: string; url: string } | null;
  pending: { block: boolean; text: string }[];
}
