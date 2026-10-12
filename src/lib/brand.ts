// Marca por organização: nome exibido, logo e cor de destaque. Parte pura (sem banco).

export const PRODUCT_NAME = "ContentHub";
export const DEFAULT_COLOR = "#eab308";
export const MAX_LOGO_CHARS = 200_000; // ~150 KB de imagem em data URI

export interface Brand {
  displayName: string;
  logo: string;
  color: string;
}

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Aceita https://... ou imagem embutida (png, jpeg, webp, svg). Devolve "" se não servir. */
export function cleanLogo(v: unknown): string | null {
  if (v === "" || v == null) return "";
  if (typeof v !== "string" || v.length > MAX_LOGO_CHARS) return null;
  if (/^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 2000) return v;
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  return null;
}

export function publicBrand(org: { name?: string; brand?: Partial<Brand> | null } | null | undefined): Brand {
  return {
    displayName: org?.brand?.displayName?.trim() || PRODUCT_NAME,
    logo: org?.brand?.logo || "",
    color: isHexColor(org?.brand?.color) ? org!.brand!.color!.toLowerCase() : DEFAULT_COLOR,
  };
}

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((c, i) => c + (b[i] - c) * t) as Rgb;

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Variáveis de cor da casca a partir da cor do cliente. O tema é escuro, então a cor usada
 * em TEXTO é clareada até ficar legível; o texto sobre o botão vira preto ou branco.
 */
export function brandVars(color: string | null | undefined): Record<string, string> {
  const base = isHexColor(color) ? color.toLowerCase() : DEFAULT_COLOR;
  // Cor padrão do produto: o amarelo de sempre, sem recalcular.
  if (base === DEFAULT_COLOR) return { "--brand-500": "#eab308", "--brand-400": "#facc15", "--brand-300": "#fde047", "--brand-ink": "#000000" };
  const white: Rgb = [255, 255, 255];
  let text = toRgb(base);
  for (let i = 0; i < 12 && luminance(toHex(text)) < 0.3; i++) text = mix(text, white, 0.15);
  return {
    "--brand-500": base,
    "--brand-400": toHex(text),
    "--brand-300": toHex(mix(text, white, 0.3)),
    "--brand-ink": luminance(base) > 0.4 ? "#000000" : "#ffffff",
  };
}

export function slugify(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
