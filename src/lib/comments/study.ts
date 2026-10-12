import { CATEGORIES, CATEGORY_LABEL, type Category, type Classification, NEEDS_REPLY, type Sentiment } from "./classify";
import { normalize } from "./rules";

// ESTUDO DOS COMENTÁRIOS: tudo calculado a partir do que está guardado, sem chamar ninguém.
// Vale para um post ou para um período inteiro (a lista que entra é que muda).

export interface StudyComment {
  igId: string;
  mediaIgId: string;
  parentIgId: string | null;
  username: string;
  text: string;
  timestamp: Date | string;
  likeCount: number;
  own: boolean;
  answered: boolean;
  answeredAt: Date | string | null;
  cls: Classification;
}

export interface QuestionGroup {
  theme: string;
  label: string;
  count: number;
  examples: string[];
  unanswered: number;
}

export interface Study {
  /** comentários do público (fora os da própria conta), respostas de terceiros incluídas */
  total: number;
  topLevel: number;
  ownReplies: number;
  people: number;
  byCategory: { key: Category; label: string; count: number; pct: number }[];
  sentiment: Record<Sentiment, number>;
  questions: QuestionGroup[];
  terms: { term: string; count: number }[];
  commenters: { username: string; count: number }[];
  unanswered: { total: number; important: number; byCategory: Partial<Record<Category, number>>; oldest: string | null };
  response: { answered: number; rate: number | null; avgMinutes: number | null; medianMinutes: number | null };
  hours: { hour: number; count: number }[];
  weekdays: { day: number; label: string; count: number }[];
  bestHours: number[];
  ideas: string[];
  /** quem classificou: um id só, ou "misto" */
  provider: string;
  simple: boolean;
}

const BRT_MS = 3 * 3_600_000;
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const STOP = new Set(
  ("a o as os um uma uns umas de do da dos das em no na nos nas por pra para com sem que e ou mas se eu tu ele ela nos vos eles elas voce voces vc vcs me te lhe meu minha seu sua nosso nossa " +
    "isso isto aquilo esse essa este esta aquele aquela ja nao sim so tb tambem muito muita mais menos bem mal como quando onde qual quais quem porque pq ser estar tem ter tinha foi era sao esta estao estou " +
    "vai vou ir fazer faz fiz pode posso tudo todo toda todos todas cada ate la aqui ai ali agora hoje sempre nunca ainda depois antes sobre entre pelo pela aos ao the kk kkk kkkk rs rsrs ne ta to pro num numa " +
    "gente coisa dia vez assim entao tipo sera queria quero gostaria saber favor obrigada obrigado ola oi bom boa dr dra doutor doutora").split(" ")
);

/** Temas de pergunta que se repetem em qualquer negócio: rótulo + ideia de post. */
const THEMES: { key: string; label: string; re: RegExp; idea: string }[] = [
  { key: "preco", label: "Preço e orçamento", re: /(quanto custa|quanto e\b|quanto fica|quanto sai|\bvalor|\bpreco|orcamento|\bqto\b|quanto cobra|custa quanto)/, idea: "Explique em um post o que entra no valor e como pedir um orçamento, sem obrigar a pessoa a perguntar nos comentários" },
  { key: "agendar", label: "Como agendar ou comprar", re: /(agend|marcar|marco\b|tem vaga|tem horario|como (eu )?(compro|faco|contrato)|onde compro|link|whats|direct|contato)/, idea: "Mostre o passo a passo para agendar ou comprar (onde clicar, com quem falar, quanto tempo leva)" },
  { key: "local", label: "Onde fica e onde atende", re: /(onde fica|endereco|qual cidade|que cidade|\bcidade\b|atende em|atendem em|tem em\b|\bbairro\b|localiza|fica onde|\bestado\b|entrega em|envia para|enviam para)/, idea: "Faça um post fixo com endereço, cidades atendidas e como chegar" },
  { key: "pagamento", label: "Formas de pagamento e convênio", re: /(parcel|cartao|\bpix\b|convenio|plano de saude|\bplano\b|boleto|aceita|desconto)/, idea: "Liste as formas de pagamento, parcelamento e convênios aceitos" },
  { key: "tempo", label: "Quanto tempo leva", re: /(quanto tempo|demora|quantas sessoes|quantos dias|\bprazo\b|dura quanto|quanto dura|quando fica pronto)/, idea: "Explique os prazos: quanto tempo leva, quantas etapas e quando aparece o resultado" },
  { key: "dor", label: "Dói? É seguro?", re: /(\bdoi\b|\bdor\b|doloros|anestesia|\brisco|e seguro|seguro\?|efeito colateral|contraindic|faz mal|\bmedo\b|recuperacao|pos operatorio)/, idea: "Responda sem rodeio as dúvidas de dor, segurança e recuperação (é a objeção que mais trava a decisão)" },
  { key: "resultado", label: "Funciona? Para quem serve?", re: /(funciona|serve pra|serve para|resolve|resultado|da certo|quem pode|qualquer pessoa|posso fazer|pode fazer|indicado|\bidade\b|crianca|gravida)/, idea: "Mostre para quem serve e para quem não serve, com um caso real de resultado" },
  { key: "horario", label: "Horário de atendimento", re: /(que horas|horario de|abre\b|fecha\b|funciona (sabado|domingo|feriado)|atende (sabado|domingo|feriado|a noite))/, idea: "Publique os horários de atendimento e deixe no destaque" },
];

const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
const ms = (d: Date | string) => new Date(d).getTime();

function tokens(text: string): string[] {
  return normalize(text)
    .replace(/@[a-z0-9._]+/g, " ")
    .replace(/https?:\S+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t) && !/^(k+|ha+|rs+|a+h*|o+h*)$/.test(t));
}

const clip = (text: string, max = 110) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Agrupa as perguntas: primeiro pelos temas conhecidos; o resto, por palavras em comum. */
export function groupQuestions(list: StudyComment[]): QuestionGroup[] {
  const groups = new Map<string, { theme: string; label: string; items: StudyComment[]; toks?: Set<string> }>();
  const loose: { c: StudyComment; toks: Set<string> }[] = [];
  for (const c of list) {
    const norm = normalize(c.text);
    const theme = THEMES.find((t) => t.re.test(norm));
    if (theme) {
      const g = groups.get(theme.key) ?? { theme: theme.key, label: theme.label, items: [] };
      g.items.push(c);
      groups.set(theme.key, g);
    } else loose.push({ c, toks: new Set(tokens(c.text)) });
  }
  // Perguntas fora dos temas: junta as que dividem pelo menos metade das palavras.
  const clusters: { items: StudyComment[]; toks: Set<string> }[] = [];
  for (const { c, toks } of loose) {
    let best: (typeof clusters)[number] | null = null;
    let bestScore = 0;
    for (const k of clusters) {
      const inter = [...toks].filter((t) => k.toks.has(t)).length;
      const score = inter / Math.max(1, Math.min(toks.size, k.toks.size));
      if (inter >= 1 && score >= 0.5 && score > bestScore) {
        best = k;
        bestScore = score;
      }
    }
    if (best) {
      best.items.push(c);
      for (const t of toks) best.toks.add(t);
    } else clusters.push({ items: [c], toks: new Set(toks) });
  }
  const out: QuestionGroup[] = [];
  const pack = (theme: string, label: string, items: StudyComment[]) =>
    out.push({ theme, label, count: items.length, examples: [...new Set(items.map((i) => clip(i.text)))].slice(0, 3), unanswered: items.filter((i) => !i.parentIgId && !i.answered).length });
  for (const g of groups.values()) pack(g.theme, g.label, g.items);
  for (const k of clusters) pack("", clip(k.items[0].text, 70), k.items);
  return out.sort((a, b) => b.count - a.count || Number(Boolean(b.theme)) - Number(Boolean(a.theme)));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildStudy(comments: StudyComment[]): Study {
  const audience = comments.filter((c) => !c.own);
  const top = audience.filter((c) => !c.parentIgId);
  const total = audience.length;

  const catCount = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<Category, number>;
  const sentiment: Record<Sentiment, number> = { positivo: 0, neutro: 0, negativo: 0 };
  const termCount = new Map<string, number>();
  const who = new Map<string, number>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const weekdays = WEEKDAYS.map((label, day) => ({ day, label, count: 0 }));
  const providers = new Set<string>();

  for (const c of audience) {
    catCount[c.cls.category]++;
    sentiment[c.cls.sentiment]++;
    providers.add(c.cls.provider);
    if (c.cls.category !== "spam") for (const t of new Set(tokens(c.text))) termCount.set(t, (termCount.get(t) || 0) + 1);
    if (c.username) who.set(c.username, (who.get(c.username) || 0) + 1);
    const local = new Date(ms(c.timestamp) - BRT_MS);
    hours[local.getUTCHours()].count++;
    weekdays[local.getUTCDay()].count++;
  }

  // Sem resposta e tempo de resposta: só comentário de primeiro nível (é onde a conta responde).
  const open = top.filter((c) => !c.answered && c.cls.category !== "spam");
  const important = open.filter((c) => NEEDS_REPLY.includes(c.cls.category));
  const byCategory: Partial<Record<Category, number>> = {};
  for (const c of open) byCategory[c.cls.category] = (byCategory[c.cls.category] || 0) + 1;
  const answeredList = top.filter((c) => c.answered);
  const waits = answeredList.filter((c) => c.answeredAt).map((c) => (ms(c.answeredAt as Date) - ms(c.timestamp)) / 60_000).filter((m) => m >= 0);
  const answerable = top.filter((c) => c.cls.category !== "spam").length;

  const questions = groupQuestions(audience.filter((c) => c.cls.isQuestion && c.cls.category !== "spam" && c.cls.category !== "marcacao"));
  const ideas: string[] = [];
  for (const q of questions.slice(0, 6)) {
    const theme = THEMES.find((t) => t.key === q.theme);
    const n = q.count === 1 ? "Foi 1 pergunta" : `Foram ${q.count} perguntas`;
    ideas.push(theme ? `${theme.idea}. ${n} no tema "${theme.label}".` : `Responda em um post a pergunta "${q.label}". ${n} desse tipo.`);
  }
  if (catCount.objecao > 0) ideas.push(`Faça um post quebrando a objeção que mais aparece (${catCount.objecao} ${catCount.objecao === 1 ? "comentário" : "comentários"} com "é caro", medo ou "será que funciona").`);
  if (catCount.elogio >= 5) ideas.push(`Transforme os elogios em prova: um post com depoimentos (${catCount.elogio} elogios no período; peça autorização antes de mostrar o nome).`);

  const max = Math.max(...hours.map((h) => h.count));
  return {
    total,
    topLevel: top.length,
    ownReplies: comments.filter((c) => c.own).length,
    people: who.size,
    byCategory: CATEGORIES.map((key) => ({ key, label: CATEGORY_LABEL[key], count: catCount[key], pct: pctOf(catCount[key], total) })).filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
    sentiment,
    questions: questions.slice(0, 12),
    terms: [...termCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([term, count]) => ({ term, count })),
    commenters: [...who.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([username, count]) => ({ username, count })),
    unanswered: {
      total: open.length,
      important: important.length,
      byCategory,
      oldest: open.length ? new Date(Math.min(...open.map((c) => ms(c.timestamp)))).toISOString() : null,
    },
    response: {
      answered: answeredList.length,
      rate: answerable > 0 ? pctOf(answeredList.length, answerable) : null,
      avgMinutes: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      medianMinutes: waits.length ? Math.round(median(waits) as number) : null,
    },
    hours,
    weekdays,
    bestHours: max > 0 ? [...hours].sort((a, b) => b.count - a.count || a.hour - b.hour).slice(0, 3).filter((h) => h.count > 0).map((h) => h.hour) : [],
    ideas,
    provider: providers.size === 1 ? [...providers][0] : providers.size === 0 ? "" : "misto",
    simple: [...providers].every((p) => !p.startsWith("ia:")),
  };
}

export function fmtDuration(minutes: number | null): string {
  if (minutes == null) return "sem dado";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }
  return `${Math.round(minutes / 1440)} dias`;
}

export interface GapInfo {
  /** quantos comentários o Instagram diz que existem (comments_count) */
  reported: number;
  /** quantos ele entregou ao aplicativo */
  fetched: number;
  /** mídias com comentário informado e nenhuma busca feita ainda */
  pendingMedia: number;
  /** mídias conferidas */
  checkedMedia: number;
  lastSyncAt: string | null;
}

export const gapMessage = (g: Pick<GapInfo, "reported" | "fetched">) =>
  `O Instagram informou ${g.reported.toLocaleString("pt-BR")} ${g.reported === 1 ? "comentário" : "comentários"}, mas só liberou ${g.fetched.toLocaleString("pt-BR")} para o aplicativo. Enquanto o aplicativo não é aprovado pela Meta, só aparecem comentários de contas de teste.`;

/** Relatório em TEXTO PLANO (Telegram/WhatsApp): sem markdown, sem asterisco. */
export function buildCommentsReport(input: { username: string; scope: string; study: Study; gap: GapInfo; posts?: number }): string {
  const { study: s, gap } = input;
  const n = (v: number) => v.toLocaleString("pt-BR");
  const L: string[] = [];
  L.push(`COMENTÁRIOS @${input.username}`);
  L.push(input.scope);
  L.push("");
  if (gap.reported > gap.fetched) {
    L.push(`ATENÇÃO: ${gapMessage(gap)}`);
    L.push("");
  }
  if (gap.pendingMedia > 0) {
    L.push(`${n(gap.pendingMedia)} ${gap.pendingMedia === 1 ? "post ainda não teve" : "posts ainda não tiveram"} os comentários buscados. Use "Buscar comentários" na tela.`);
    L.push("");
  }
  if (s.total === 0) {
    L.push(gap.reported > 0 ? "Nenhum comentário disponível para estudar ainda." : "Nenhum comentário no período.");
    return L.join("\n");
  }
  L.push(`Comentários estudados: ${n(s.total)} de ${n(s.people)} ${s.people === 1 ? "pessoa" : "pessoas"}${input.posts != null ? ` em ${n(input.posts)} ${input.posts === 1 ? "post" : "posts"}` : ""}`);
  L.push(`Sentimento: ${n(s.sentiment.positivo)} positivos, ${n(s.sentiment.neutro)} neutros, ${n(s.sentiment.negativo)} negativos`);
  L.push("");
  L.push("O QUE AS PESSOAS ESCREVEM");
  for (const c of s.byCategory) L.push(`- ${c.label}: ${n(c.count)} (${c.pct.toLocaleString("pt-BR")}%)`);
  L.push("");
  L.push("RESPOSTAS DA CONTA");
  L.push(`- Sem resposta: ${n(s.unanswered.total)}${s.unanswered.important ? `, sendo ${n(s.unanswered.important)} de dúvida, preço, intenção de compra, objeção ou reclamação` : ""}`);
  L.push(`- Respondidos: ${n(s.response.answered)}${s.response.rate != null ? ` (${s.response.rate.toLocaleString("pt-BR")}%)` : ""}`);
  L.push(`- Tempo médio de resposta: ${fmtDuration(s.response.avgMinutes)}${s.response.medianMinutes != null ? ` (metade em até ${fmtDuration(s.response.medianMinutes)})` : ""}`);
  if (s.questions.length) {
    L.push("");
    L.push("PERGUNTAS QUE MAIS SE REPETEM");
    s.questions.slice(0, 6).forEach((q, i) => {
      L.push(`${i + 1}. ${q.label}: ${n(q.count)}x${q.unanswered ? ` (${n(q.unanswered)} sem resposta)` : ""}`);
      if (q.theme && q.examples[0]) L.push(`   ex.: "${q.examples[0]}"`);
    });
  }
  if (s.terms.length) {
    L.push("");
    L.push(`TERMOS MAIS CITADOS: ${s.terms.slice(0, 10).map((t) => `${t.term} (${t.count})`).join(", ")}`);
  }
  if (s.commenters.length) {
    L.push("");
    L.push(`QUEM MAIS COMENTA: ${s.commenters.slice(0, 5).map((c) => `@${c.username} (${c.count})`).join(", ")}`);
  }
  if (s.bestHours.length) {
    const day = [...s.weekdays].sort((a, b) => b.count - a.count)[0];
    L.push("");
    L.push(`HORÁRIOS COM MAIS COMENTÁRIOS: ${s.bestHours.map((h) => `${h}h`).join(", ")}${day?.count ? ` · dia mais forte: ${day.label}` : ""}`);
  }
  if (s.ideas.length) {
    L.push("");
    L.push("IDEIAS DE POST A PARTIR DAS DÚVIDAS");
    s.ideas.slice(0, 5).forEach((idea, i) => L.push(`${i + 1}. ${idea}`));
  }
  L.push("");
  L.push(s.simple ? "Classificação automática simples (por palavras-chave): serve para dar direção, não é exata." : "Classificação feita por inteligência artificial: pode errar em ironia e contexto.");
  return L.join("\n");
}
