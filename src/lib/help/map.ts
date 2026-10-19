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

// POPUP DE AJUDA: qual guia de TELA (print marcado + passos, docs/ajuda/telas/*.md) abre o "?" de cada tela
// e de cada item do menu. A tela leva ao artigo dela (campo `artigo` do guia).
const SCREEN_BY_VIEW: Record<string, string> = {
  calendar: "calendario", list: "lista", aprovacoes: "aprovacoes", instagram: "instagram", estudio: "estudio-carrossel",
  trafego: "trafego", concorrentes: "concorrentes", automacoes: "automacoes", contatos: "contatos", crm: "crm-funil",
  ajuda: "ajuda", clientes: "clientes", conta: "conta", configuracoes: "config-redes", projetos: "projetos",
};
const SCREEN_BY_TAB: Record<string, Record<string, string>> = {
  instagram: { comentarios: "comentarios" },
  estudio: { carrossel: "estudio-carrossel", reel: "estudio-reel", cenas: "estudio-cenas", padroes: "estudio-padroes", biblioteca: "estudio-biblioteca", kit: "estudio-kit", chaves: "estudio-chaves", uso: "estudio-uso" },
  concorrentes: { perfis: "concorrentes", anuncios: "concorrentes-anuncios", produtos: "concorrentes-produtos", ofertas: "ofertas" },
  automacoes: { lista: "automacoes", execucoes: "automacoes-execucoes" },
  crm: { funil: "crm-funil", lista: "crm-lista", tarefas: "crm-tarefas", relatorios: "crm-relatorios", rastreio: "crm-rastreio", entradas: "crm-entradas", funis: "crm-etapas" },
  configuracoes: { social: "config-redes", apis: "config-apis" },
};
/** O guia de tela do "?" (a visão e a aba do link). */
export function screenFor(view: string, tab?: string | null): string {
  return (tab && SCREEN_BY_TAB[view]?.[tab]) || SCREEN_BY_VIEW[view] || "calendario";
}
/** Todas as telas que algum "?" abre (o teste confere que cada uma tem guia e print). */
export const LINKED_SCREENS = [...new Set([...Object.values(SCREEN_BY_VIEW), ...Object.values(SCREEN_BY_TAB).flatMap((t) => Object.values(t))])];
