"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { type BrandInfo, BrandMark, DEFAULT_BRAND, fieldCls, primaryBtn, varsStyle } from "@/components/brand";

interface InviteInfo {
  kind: "owner" | "member" | "reset";
  organizationName: string;
  email: string;
  name: string;
  expiresAt: string;
  brand: BrandInfo;
  vars: Record<string, string>;
}

// Tela do convite: a pessoa define a senha e já entra. Também serve ao link de nova senha.
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [gone, setGone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok) return setGone(data.error || "Esse link não vale mais.");
        setInfo(data);
        setName(data.name || "");
        setEmail(data.email || "");
      })
      .catch(() => setGone("Sem conexão com o servidor. Tente abrir o link de novo."));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 410) setGone(data.error);
      else setError({ msg: data.error || "Não deu certo. Tente de novo.", field: data.field });
    } catch {
      setError({ msg: "Sem conexão com o servidor. Tente de novo." });
    }
    setBusy(false);
  }

  const reset = info?.kind === "reset";
  const err = (field: string) => (error?.field === field ? <p className="text-xs text-red-400 mt-1.5" role="alert">{error.msg}</p> : null);
  const ready = password.length >= 10 && (reset || (name.trim().length >= 2 && email.includes("@")));

  return (
    <main className="flex-1 flex items-center justify-center p-4" style={varsStyle(info?.vars)}>
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6" data-testid="invite-card">
        <BrandMark brand={info?.brand || DEFAULT_BRAND} size="lg" />
        {gone ? (
          <div className="mt-4 space-y-4" data-testid="invite-gone">
            <p className="text-sm text-gray-300">{gone}</p>
            <a href="/login" className="text-sm text-brand-400 hover:text-brand-300 underline underline-offset-2">Já tenho senha: entrar</a>
          </div>
        ) : !info ? (
          <p className="text-sm text-gray-400 mt-4">Conferindo o convite...</p>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-4">
            <p className="text-sm text-gray-300">
              {reset ? (
                <>Crie uma senha nova para <span className="font-semibold text-white">{info.email}</span>.</>
              ) : (
                <>
                  Você foi convidado para {info.kind === "owner" ? "cuidar da conta" : "a equipe"} de{" "}
                  <span className="font-semibold text-white">{info.organizationName}</span>. Crie a sua senha para entrar.
                </>
              )}
            </p>
            {!reset && (
              <>
                <div>
                  <label htmlFor="inv-email" className="text-xs text-gray-400">E-mail (será o seu login)</label>
                  <input id="inv-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={Boolean(info.email)} className={`${fieldCls(error?.field === "email")} read-only:opacity-70`} />
                  {err("email")}
                </div>
                <div>
                  <label htmlFor="inv-name" className="text-xs text-gray-400">Seu nome</label>
                  <input id="inv-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls(error?.field === "name")} />
                  {err("name")}
                </div>
              </>
            )}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="inv-password" className="text-xs text-gray-400">Senha</label>
                <button type="button" onClick={() => setShow(!show)} className="text-xs text-gray-400 hover:text-gray-200">{show ? "Ocultar" : "Mostrar"}</button>
              </div>
              <input id="inv-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldCls(error?.field === "password")} />
              {err("password") || <p className="text-xs text-gray-500 mt-1.5">Pelo menos 10 caracteres, com letras e números.</p>}
            </div>
            {error && !error.field && <p className="text-xs text-red-400" role="alert">{error.msg}</p>}
            <button type="submit" disabled={busy || !ready} className={`${primaryBtn} w-full`}>
              {busy ? "Salvando..." : reset ? "Salvar senha e entrar" : "Criar senha e entrar"}
            </button>
            <p className="text-xs text-gray-500">
              Link de uso único, válido até {new Date(info.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
