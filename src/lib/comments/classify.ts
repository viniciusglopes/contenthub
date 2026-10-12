// CLASSIFICADOR DE COMENTÁRIOS: uma interface, dois provedores.
//   regras  (src/lib/comments/rules.ts)  léxico em português, sem custo, funciona hoje;
//   ia      (src/lib/comments/llm.ts)    lista de provedores em sequência com fallback (etapa seguinte).
// Quem consome (estudo, tela, relatório) só conhece `Classification`.

export const CATEGORIES = ["elogio", "duvida", "objecao", "preco", "intencao", "reclamacao", "marcacao", "spam", "outro"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Sentiment = "positivo" | "neutro" | "negativo";

export const CATEGORY_LABEL: Record<Category, string> = {
  elogio: "Elogio",
  duvida: "Dúvida",
  objecao: "Objeção",
  preco: "Pedido de preço",
  intencao: "Quer comprar ou agendar",
  reclamacao: "Reclamação",
  marcacao: "Marcou um amigo",
  spam: "Spam ou irrelevante",
  outro: "Outros",
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = { positivo: "Positivo", neutro: "Neutro", negativo: "Negativo" };

/** Categorias em que a conta deveria responder: é onde está a venda (ou o risco). */
export const NEEDS_REPLY: Category[] = ["duvida", "preco", "intencao", "reclamacao", "objecao"];

export interface Classification {
  category: Category;
  sentiment: Sentiment;
  isQuestion: boolean;
  /** quem classificou: "regras-v1" ou o id do provedor de IA */
  provider: string;
}

export interface ClassifyInput {
  id: string;
  text: string;
}

export interface CommentClassifier {
  id: string;
  /** rótulo honesto para a tela */
  label: string;
  /** devolve UMA classificação por item, na mesma ordem */
  classify(items: ClassifyInput[]): Promise<Classification[]>;
}

export function isClassification(v: unknown): v is Classification {
  const c = v as Classification | null;
  return Boolean(
    c && typeof c === "object" && (CATEGORIES as readonly string[]).includes(c.category) &&
      ["positivo", "neutro", "negativo"].includes(c.sentiment) && typeof c.isQuestion === "boolean" && typeof c.provider === "string"
  );
}
