"use client";
/* eslint-disable react-hooks/set-state-in-effect -- marca lida do link e do navegador */

import { useEffect, useState } from "react";
import { type BrandInfo, BrandMark, DEFAULT_BRAND, fieldCls, primaryBtn, recallBrand, varsStyle } from "@/components/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [brand, setBrand] = useState<BrandInfo>(DEFAULT_BRAND);
  const [vars, setVars] = useState<Record<string, string>>({});

  // Marca do cliente: pelo link (/login?c=<cliente>) ou pela última usada neste aparelho.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("c");
    const remembered = recallBrand();
    if (!slug && remembered) {
      setBrand(remembered.brand);
      setVars(remembered.vars);
    }
    const wanted = slug || remembered?.slug;
    if (!wanted) return;
    fetch(`/api/auth/brand?slug=${encodeURIComponent(wanted)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.brand) {
          setBrand(d.brand);
          setVars(d.vars);
        }
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Não foi possível entrar. Tente de novo.");
    } catch {
      setError("Sem conexão com o servidor. Tente de novo.");
    }
    setBusy(false);
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4" style={varsStyle(vars)}>
      <form onSubmit={submit} className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4" data-testid="login-form">
        <div>
          <BrandMark brand={brand} size="lg" />
          <p className="text-sm text-gray-400 mt-2">Entre com o seu e-mail e a sua senha.</p>
        </div>
        <div>
          <label htmlFor="email" className="text-xs text-gray-400">E-mail</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls()}
          />
        </div>
        <div>
          <label htmlFor="password" className="text-xs text-gray-400">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldCls(Boolean(error))}
          />
          {error && <p className="text-xs text-red-400 mt-1.5" role="alert">{error}</p>}
        </div>
        <button type="submit" disabled={busy || !email || !password} className={`${primaryBtn} w-full`}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
        <div>
          <button type="button" onClick={() => setForgot(!forgot)} className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2" aria-expanded={forgot}>
            Esqueci a senha
          </button>
          {forgot && (
            <p className="text-xs text-gray-400 mt-2 bg-gray-800/60 border border-gray-700 rounded-lg p-3" data-testid="forgot-note">
              Peça um novo link ao administrador da sua conta. Ele gera um link de nova senha (vale 7 dias, uso único) e te envia. Ainda não há recuperação automática por e-mail.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
