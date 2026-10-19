export interface Article { id: string; title: string; summary: string; order: number; admin: boolean; tags: string[]; body: string }
/**
 * Guia de uma TELA do ContentHub: o print da própria tela com números marcados (public/ajuda/telas/<id>.webp)
 * e o que cada número faz. `area` é o item do menu a que a tela pertence; `article` é o artigo da Ajuda que
 * continua a explicação (vem de docs/ajuda/telas/*.md).
 */
export interface Screen { id: string; area: string; title: string; summary: string; article: string; order: number; admin: boolean; image: string; width: number; height: number; steps: string[] }
