// Qual artigo da Ajuda abre o "?" de cada tela (arquivo puro: serve à casca e aos testes).
const BY_VIEW: Record<string, string> = {
  calendar: "calendario-e-aprovacao", list: "calendario-e-aprovacao", aprovacoes: "calendario-e-aprovacao",
  instagram: "instagram", trafego: "trafego", concorrentes: "concorrentes", clientes: "admin-clientes",
  conta: "primeiros-passos", configuracoes: "chaves-e-integracoes", estudio: "estudio", ajuda: "primeiros-passos",
  automacoes: "automacoes", contatos: "contatos-e-lgpd", crm: "crm",
};
const BY_CRM_TAB: Record<string, string> = { funil: "crm", lista: "crm", tarefas: "crm", relatorios: "crm-relatorios", entradas: "crm-entradas", funis: "crm", rastreio: "rastreamento-script" };
const BY_ESTUDIO_TAB: Record<string, string> = { cenas: "reel-com-cenas", padroes: "padroes-de-video", biblioteca: "reel-com-cenas", chaves: "chaves-e-integracoes", uso: "chaves-e-integracoes", kit: "estudio" };

export function helpFor(view: string, tab?: string | null): string {
  if (view === "estudio" && tab && BY_ESTUDIO_TAB[tab]) return BY_ESTUDIO_TAB[tab];
  if (view === "instagram" && tab === "comentarios") return "comentarios";
  if (view === "crm" && tab && BY_CRM_TAB[tab]) return BY_CRM_TAB[tab];
  if (view === "concorrentes" && tab === "ofertas") return "ofertas";
  return BY_VIEW[view] || "primeiros-passos";
}
/** Todos os artigos que algum "?" abre (o teste confere que existem). */
export const LINKED_ARTICLES = [...new Set([...Object.values(BY_VIEW), ...Object.values(BY_ESTUDIO_TAB), "comentarios", "meta-app-automacoes", ...Object.values(BY_CRM_TAB), "meta-lead-ads", "rastreamento-vendas", "rastreamento-capi", "rastreamento-testar", "ofertas"])];
