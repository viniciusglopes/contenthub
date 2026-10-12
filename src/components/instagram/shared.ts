export interface PublicAccount {
  _id: string;
  project: { _id: string; name: string; icon?: string; color?: string } | string;
  platform: string;
  accountName: string;
  accountId: string;
  credentials: Record<string, string>;
  credentialsFilled: Record<string, boolean>;
  active: boolean;
  lastSync: string | null;
  lastSyncError: string;
  tokenExpiresAt: string | null;
  tokenExpiryEstimated: boolean;
  tokenDaysLeft: number | null;
  tokenAction: string | null;
  connected: boolean;
  username: string;
  accountType: string;
  followersCount: number | null;
  profilePictureUrl: string;
}

export const fmt = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString("pt-BR"));

export const fmtPct = (p: number | null | undefined) =>
  p == null ? null : `${p > 0 ? "+" : ""}${(Math.round(p * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export const fmtDay = (iso: string | null | undefined, withYear = false) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", ...(withYear ? { year: "numeric" } : {}) })
    : "";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso)
        .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        .replace(",", " às")
    : "";

/** POST/GET que sempre devolve { ok, data, error } com mensagem em português. */
export async function api<T = unknown>(url: string, body?: unknown): Promise<{ ok: boolean; data: T | null; error: string; field?: string }> {
  try {
    const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return { ok: false, data: null, error: "Sessão expirada. Entre de novo." };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, data: null, error: data?.error || "Não deu certo. Tente de novo.", field: data?.field };
    return { ok: true, data, error: "" };
  } catch {
    return { ok: false, data: null, error: "Sem conexão com o servidor. Tente de novo." };
  }
}

export function tokenLabel(a: PublicAccount): { text: string; tone: "ok" | "warn" | "bad" } {
  if (a.tokenDaysLeft == null) return { text: "sem validade registrada", tone: "warn" };
  if (a.tokenDaysLeft < 0) return { text: `token venceu em ${fmtDay(a.tokenExpiresAt)}`, tone: "bad" };
  const approx = a.tokenExpiryEstimated ? " (previsão)" : "";
  return {
    text: `vence em ${fmtDay(a.tokenExpiresAt)}${approx}`,
    tone: a.tokenDaysLeft <= 7 ? "warn" : "ok",
  };
}

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* navegação privada */
  }
}
