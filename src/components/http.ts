// Pedido à API que sempre devolve { ok, data, error, field } com mensagem em português.
export interface Result<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string;
  field?: string;
}

export async function send<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return { ok: false, status: 401, data: null, error: "Sessão expirada. Entre de novo." };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, data: null, error: data?.error || "Não deu certo. Tente de novo.", field: data?.field };
    return { ok: true, status: res.status, data, error: "" };
  } catch {
    return { ok: false, status: 0, data: null, error: "Sem conexão com o servidor. Tente de novo." };
  }
}

export const fmtWhen = (iso: string | null | undefined, never = "nunca") =>
  iso
    ? new Date(iso)
        .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        .replace(",", " às")
    : never;

export const ROLE_LABEL: Record<string, string> = { platform_admin: "Administrador", owner: "Dono", member: "Membro" };
export const INVITE_LABEL: Record<string, string> = { owner: "Convite de dono", member: "Convite de membro", reset: "Link de nova senha" };

export interface TeamUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}
export interface PendingInvite {
  _id: string;
  kind: string;
  email: string;
  name: string;
  status: string;
  expiresAt: string;
}
