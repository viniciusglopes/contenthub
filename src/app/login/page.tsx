"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
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
    <main className="flex-1 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">ContentHub</h1>
          <p className="text-sm text-gray-400 mt-1">Digite a senha para entrar.</p>
        </div>
        <div>
          <label htmlFor="password" className="text-xs text-gray-400">Senha</label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full bg-gray-800 border rounded-lg px-3 py-2.5 text-base mt-1 text-gray-100 outline-none focus:border-yellow-500 ${error ? "border-red-500/60" : "border-gray-700"}`}
          />
          {error && <p className="text-xs text-red-400 mt-1.5" role="alert">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full bg-yellow-500 text-black font-bold py-2.5 rounded-lg hover:bg-yellow-400 transition disabled:opacity-50"
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
