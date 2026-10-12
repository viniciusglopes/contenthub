"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { type PublicAccount, api, fmt, fmtDateTime, tokenLabel } from "./shared";

interface ProjectOpt {
  _id: string;
  name: string;
  icon?: string;
}

const inputCls = "w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm mt-1 text-gray-100 outline-none focus:border-brand-500";

/** Colar o token -> validar -> salvar. Um botão só. */
export function InstagramConnectForm({
  projects,
  defaultProject,
  account,
  oauth = false,
  isAdmin = false,
  bare = false,
  onDone,
  onCancel,
}: {
  projects: ProjectOpt[];
  defaultProject?: string;
  account?: PublicAccount | null;
  /** login pelo Instagram liberado (IG_OAUTH_ENABLED): vira o caminho principal */
  oauth?: boolean;
  /** só o administrador vê o passo a passo de gerar token no painel da Meta */
  isAdmin?: boolean;
  /** sem moldura nem título (dentro dos primeiros passos) */
  bare?: boolean;
  onDone: (a: PublicAccount) => void;
  onCancel?: () => void;
}) {
  const accountProject = account ? (typeof account.project === "string" ? account.project : account.project?._id) : "";
  const [project, setProject] = useState(accountProject || defaultProject || (projects.length === 1 ? projects[0]._id : ""));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [help, setHelp] = useState(false);
  // Com o login liberado, colar token vira a alternativa (escondida atrás de um link).
  const useOauth = oauth && !account;
  const [paste, setPaste] = useState(!useOauth);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<PublicAccount>("/api/instagram/connect", { project, token, accountId: account?._id });
    setBusy(false);
    if (r.ok && r.data) onDone(r.data);
    else setError({ msg: r.error, field: r.field });
  }

  return (
    <form onSubmit={submit} className={bare ? "space-y-3" : "bg-gray-800/50 rounded-xl p-4 border border-brand-500/30 space-y-3"} data-testid="ig-connect-form">
      {!bare && (
        <h4 className="text-sm font-semibold text-brand-400">
          {account ? `Trocar o token de ${account.accountName}` : "Conectar Instagram"}
        </h4>
      )}
      <div>
        <label htmlFor="ig-project" className="text-xs text-gray-400">Projeto</label>
        <select
          id="ig-project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          required
          disabled={Boolean(account)}
          className={`${inputCls} disabled:opacity-60 ${error?.field === "project" ? "border-red-500/60" : "border-gray-700"}`}
        >
          <option value="">Selecione...</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>{p.icon} {p.name}</option>
          ))}
        </select>
        {error?.field === "project" && <p className="text-xs text-red-400 mt-1" role="alert">{error.msg}</p>}
      </div>
      {useOauth && (
        <div className="space-y-2" data-testid="ig-oauth">
          <p className="text-xs text-gray-400">
            Você vai para o Instagram, entra com a conta da empresa (precisa ser Empresa ou Criador de conteúdo) e autoriza a leitura dos seus posts e números. Nada é publicado.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={project ? `/api/instagram/oauth/start?project=${project}` : undefined}
              aria-disabled={!project}
              className={`bg-brand-500 text-brand-ink font-bold px-4 py-2.5 rounded-lg hover:bg-brand-400 transition text-sm ${project ? "" : "opacity-50 pointer-events-none"}`}
            >
              Conectar com o Instagram
            </a>
            {!paste && (
              <button type="button" onClick={() => setPaste(true)} className="text-sm text-gray-400 hover:text-gray-200 underline underline-offset-2">
                Tenho um token: colar
              </button>
            )}
            {!paste && onCancel && (
              <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-200 underline-offset-2 hover:underline">Cancelar</button>
            )}
          </div>
        </div>
      )}
      {!useOauth && !account && (
        <p className="text-xs text-gray-400 bg-gray-800/60 border border-gray-700 rounded-lg p-3" data-testid="ig-token-only">
          Por enquanto a conexão é por token. O login direto pelo Instagram depende de uma análise do nosso aplicativo pela Meta, que ainda está em andamento.{" "}
          {isAdmin
            ? "Até lá, cadastre o Instagram do cliente como testador no app da Meta, gere o token e cole abaixo."
            : "Até lá, o suporte cadastra o seu Instagram, gera o token e envia para você colar abaixo."}
        </p>
      )}
      {paste && (<>
      <div>
        <label htmlFor="ig-token" className="text-xs text-gray-400">Token de acesso{isAdmin ? " (gerado no painel do app da Meta)" : " (enviado pelo suporte)"}</label>
        <textarea
          id="ig-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder="Cole aqui o token (começa com IG...)"
          className={`${inputCls} font-mono text-xs break-all ${error && error.field !== "project" ? "border-red-500/60" : "border-gray-700"}`}
        />
        {error && error.field !== "project" && <p className="text-xs text-red-400 mt-1" role="alert">{error.msg}</p>}
        <p className="text-xs text-gray-500 mt-1">
          O nome da conta vem do próprio Instagram. O token fica guardado criptografado e não aparece mais na tela.
        </p>
      </div>
      {isAdmin && (
        <button type="button" onClick={() => setHelp(!help)} className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1">
          {help ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Onde eu gero esse token?
        </button>
      )}
      {isAdmin && help && (
        <ol className="text-xs text-gray-400 list-decimal pl-5 space-y-1">
          <li>Abra developers.facebook.com, entre em Meus apps e escolha o app do ContentHub.</li>
          <li>No menu da esquerda: Instagram, depois Configuração da API com login do Instagram (em inglês: API setup with Instagram login).</li>
          <li>Na parte de gerar tokens de acesso, adicione a conta e clique em Gerar token (Generate token) ao lado dela.</li>
          <li>Entre com a conta do Instagram (precisa ser Empresa ou Criador) e aceite as permissões.</li>
          <li>Copie o token e cole no campo acima. Ele vale 60 dias e o sistema renova sozinho.</li>
        </ol>
      )}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={busy || !token.trim() || !project}
          className="flex-1 bg-brand-500 text-brand-ink font-bold py-2 rounded-lg hover:bg-brand-400 transition text-sm disabled:opacity-50"
        >
          {busy ? "Conferindo com o Instagram..." : account ? "Validar e trocar token" : "Validar e conectar"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-200 underline-offset-2 hover:underline">
            Cancelar
          </button>
        )}
      </div>
      </>)}
    </form>
  );
}

type Feedback = { tone: "ok" | "wait" | "bad"; msg: string } | null;

/** Estado da conexão + ações: testar, renovar, sincronizar. */
export function InstagramAccountStatus({ account, onChange }: { account: PublicAccount; onChange: (a?: PublicAccount) => void }) {
  const [busy, setBusy] = useState<"" | "test" | "renew" | "sync">("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (!account.connected) {
    return (
      <p className="text-xs text-gray-400 mt-2">
        Conta cadastrada no formato antigo, ainda sem conexão oficial. Use o lápis para colar o token.
      </p>
    );
  }
  const tk = tokenLabel(account);

  async function run(kind: "test" | "renew" | "sync") {
    setBusy(kind);
    setFeedback({ tone: "wait", msg: kind === "sync" ? "Buscando os dados no Instagram. Pode levar um minuto..." : "Falando com o Instagram..." });
    if (kind === "sync") {
      const r = await api<{ results: { ok: boolean; media: number; error?: string; warnings: string[] }[] }>("/api/instagram/sync", { account: account._id });
      const res = r.data?.results?.[0];
      if (r.ok && res?.ok)
        setFeedback({ tone: "ok", msg: `Sincronizado: ${res.media} posts atualizados.${res.warnings.length ? ` Aviso: ${res.warnings[0]}` : ""}` });
      else setFeedback({ tone: "bad", msg: res?.error || r.error || "Não foi possível sincronizar." });
      onChange();
    } else {
      const r = await api<PublicAccount>(`/api/instagram/accounts/${account._id}/${kind}`, {});
      if (r.ok && r.data) {
        setFeedback({
          tone: "ok",
          msg: kind === "test" ? `Conexão ok: @${r.data.username}, ${fmt(r.data.followersCount)} seguidores.` : `Token renovado. Agora ${tokenLabel(r.data).text}.`,
        });
        onChange(r.data);
      } else setFeedback({ tone: r.error.includes("24 horas") ? "wait" : "bad", msg: r.error });
    }
    setBusy("");
  }

  const btn = "text-xs px-2.5 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700 transition disabled:opacity-50 whitespace-nowrap";
  return (
    <div className="mt-2 space-y-2" data-testid="ig-account-status">
      <p className="text-xs text-gray-300 md:truncate" title={`Conectada como @${account.username}`}>
        <span className="text-green-400">Conectada</span> como <span className="font-semibold">@{account.username}</span>
        <span className="text-gray-500"> · </span>
        <span className={tk.tone === "bad" ? "text-red-400" : tk.tone === "warn" ? "text-yellow-400" : "text-gray-300"}>{tk.text}</span>
        {account.lastSync && <span className="text-gray-500"> · sincronizada {fmtDateTime(account.lastSync)}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => run("test")}>
          {busy === "test" ? "Testando..." : "Testar conexão"}
        </button>
        <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => run("renew")}>
          {busy === "renew" ? "Renovando..." : "Renovar agora"}
        </button>
        <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => run("sync")}>
          <RefreshCw size={12} className={`inline mr-1 ${busy === "sync" ? "animate-spin" : ""}`} />
          {busy === "sync" ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>
      {feedback && (
        <p role="status" className={`text-xs ${feedback.tone === "ok" ? "text-green-400" : feedback.tone === "bad" ? "text-red-400" : "text-gray-400"}`}>
          {feedback.msg}
        </p>
      )}
      {!feedback && account.lastSyncError && (
        <p className="text-xs text-red-400">Última sincronização falhou: {account.lastSyncError}</p>
      )}
    </div>
  );
}
