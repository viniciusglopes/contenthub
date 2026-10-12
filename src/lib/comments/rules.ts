import type { Category, Classification, CommentClassifier, Sentiment } from "./classify";

// CLASSIFICAÇÃO "AUTOMÁTICA SIMPLES": regras e léxico do português informal de comentário de
// Instagram. Sem custo e sem chamada externa. Acerta o óbvio ("quanto custa?", "amei", "@amiga olha"),
// erra ironia fina e contexto. A tela avisa que é automática simples.

export const RULES_ID = "regras-v1";

/** minúsculas, sem acento, letras repetidas 3+ vezes viram uma ("liiindo" -> "lindo") */
export function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]/gu;
const POSITIVE_EMOJI = /[❤♥😍🥰😘👏🙌🔥💯✨💖💕💗💓💜💙💚💛🧡🤍🖤😊☺😁😃😄🤩👍💪🙏😻⭐🌟🎉👌🫶😎🥳💐🌹]/u;
const NEGATIVE_EMOJI = /[😡🤬👎😠😤🤮💩😒🙄😞😢😭]/u;
const LAUGH_EMOJI = /[😂🤣😅😆]/u;

const MENTION_RE = /@[a-z0-9._]+/g;

// Listas de expressões já normalizadas (sem acento). \b nas pontas onde a palavra é curta.
const SPAM = /(https?:\/\/|www\.|\.com\b|bit\.ly|renda extra|ganhe dinheiro|ganhar dinheiro|dinheiro facil|trabalhe de casa|trabalhar em casa|\bsdv\b|segue de volta|sigo de volta|me segue|me sigam|sigam meu|siga meu|visite meu perfil|olha meu perfil|link na minha bio|compre seguidores|seguidores gratis|\bpix de\b.*\bgratis|promovo seu|divulgo seu|\bcrypto\b|\bbitcoin\b|\bforex\b)/;
const PRICE = /(quanto custa|quanto e\b|quanto ta\b|quanto esta\b|quanto fica|quanto sai|quanto que e|quanto cobra|qual o valor|qual valor|qual e o valor|qual o preco|qual preco|\bvalor\b|\bvalores\b|\bpreco\b|\bprecos\b|\borcamento\b|\bqto\b|\bqnt custa|\bquanto\?|tabela de preco|passa o valor|me passa valor|manda o valor|manda valor|custa quanto|sai por quanto)/;
const INTENT = /(\beu quero\b|\bquero\b|queria (agendar|marcar|comprar|fazer)|gostaria de (agendar|marcar|comprar|fazer|contratar)|como (eu )?(agendo|marco|compro|faco pra|faco para|contrato|adquiro|participo|me inscrevo)|\bagendar\b|agendamento|marcar (uma |um )?(consulta|horario|avaliacao|sessao)|tem vaga|tem horario|tem disponibilidade|onde (eu )?compro|como comprar|manda no direct|manda direct|me manda no direct|chama no direct|me chama|chama no whats|me chama no|passa o whats|qual o whats|qual whats|tem whats|\bwhatsapp\b|\bzap\b|link pra comprar|link para comprar|manda o link|tem o link|aceita (cartao|pix|convenio|plano)|parcela\b|parcelam|parcelado|\binteresse\b|tenho interesse|\bme inscrev|preciso (disso|muito|fazer|agendar|marcar))/;
const COMPLAINT = /(\bpessim|\bhorrivel|\bhorrorosa?|\bterrivel|nao recomendo|decepcion|nunca mais|enganac|\bgolpe\b|propaganda enganosa|\bdescaso\b|\babsurdo\b|que vergonha|uma vergonha|mal atendid|atendimento ruim|pessimo atendimento|ninguem respond|nao respond|nunca respond|sem resposta|ate agora nada|estou esperando|to esperando|esperando ate|\bdemora\b|demorou|demorando|nao entregaram|nao chegou|nao recebi|quero meu dinheiro|reembolso|\bprocon\b|reclame aqui|nao gostei|odiei|\blixo\b|\bfraude\b|me arrependi|piorou|estragou|veio errado|veio quebrad)/;
const OBJECTION = /(\bcaro\b|\bcara demais|muito caro|\bcarissim|salgado|nao tenho (dinheiro|condic|grana|tempo)|sem (dinheiro|condic|grana)|fora do meu orcamento|nao cabe no (meu )?bolso|sera que funciona|sera que da certo|sera que vale|sera mesmo|\bduvido\b|nao acredito|nao funciona|nao da certo|nao adianta|nao resolve|ja tentei|tenho medo|morro de medo|da medo|\breceio\b|nao vale a pena|\bmuito longe\b|fica longe|nao confio|parece bom demais|bom demais pra ser verdade|comigo nao funcion|pra mim nao funcion)/;
const IRONY = /(so que nao|\bsqn\b|#sqn|ate agora nada|ate hoje nada|ninguem respond|nunca respond|\bhein\b.*(dias|semanas|meses|esperando)|(dias|semanas|meses) (esperando|sem resposta)|esperando ate (agora|hoje))/;
const QUESTION_START = /^(@[a-z0-9._]+\s+)*(como|onde|quando|qual|quais|quem|por que|porque|pq|sera|pode|posso|tem\b|tem como|faz\b|fazem|funciona|serve|atende|atendem|precisa|da pra|da para|e possivel|existe|vcs|voces|alguem sabe|sabe se|aceita|aceitam|doi\b|demora quanto|quanto tempo)\b/;
const PRAISE = /(\blind[oa]s?\b|\blindissim|\bame[io]\b|\bamando\b|\bamo\b|\btop\b|\btopzera|\bperfeit|maravilh|parabens|incrivel|\bshow\b|arrasou|arrasa\b|excelente|\botim[oa]\b|\bmelhor\b|sensacional|adorei|adoro\b|gostei|obrigad|gratidao|\bgrata\b|\bgrato\b|espetacul|fantastic|\bbel[oa]\b|belissim|\bdemais\b|\bmassa\b|\bfoda\b|\bbrabo\b|que (trabalho|resultado|conteudo|dica|video|aula)\b|muito bom|muito boa|mto bom|bom demais|deus abencoe|sucesso|inspirador|necessario|verdade\b|concordo|exatamente|\bsim\b.*(isso|verdade)|recomendo|super recomendo|\bnota (10|dez|mil)\b|\buau\b|\bwow\b|\baff que lind)/;
const NEGATIVE_WORDS = /(\bruim\b|\btriste\b|\bchato\b|\bfeio\b|\bodeio\b|\bnojo\b|\bpior\b|\bfraco\b|\bmentira\b|\bfalso\b|nao gost)/;

function onlyMentions(norm: string): boolean {
  const mentions = norm.match(MENTION_RE) || [];
  if (mentions.length === 0) return false;
  const rest = norm.replace(MENTION_RE, " ").replace(EMOJI_RE, " ").replace(/[^a-z0-9 ]/g, " ").trim();
  // "@fulana olha isso", "@a @b vamos?": até 4 palavras curtas além das marcações
  return rest === "" || rest.split(/\s+/).length <= 4;
}

export function classifyText(text: string): Classification {
  const raw = (text || "").trim();
  const norm = normalize(raw);
  const letters = norm.replace(MENTION_RE, " ").replace(/[^a-z0-9]/g, "");
  const hasQ = raw.includes("?");
  const done = (category: Category, sentiment: Sentiment, isQuestion = hasQ): Classification => ({ category, sentiment, isQuestion, provider: RULES_ID });

  if (!raw) return done("outro", "neutro", false);
  if (SPAM.test(norm)) return done("spam", "neutro", false);

  // Só emoji (com ou sem marcação): o emoji decide.
  if (letters === "") {
    if ((norm.match(MENTION_RE) || []).length > 0) return done("marcacao", "neutro", false);
    if (NEGATIVE_EMOJI.test(raw)) return done("reclamacao", "negativo", false);
    if (POSITIVE_EMOJI.test(raw)) return done("elogio", "positivo", false);
    if (LAUGH_EMOJI.test(raw)) return done("outro", "positivo", false);
    return done(hasQ ? "duvida" : "outro", "neutro", hasQ);
  }

  const praise = PRAISE.test(norm);
  // Ironia simples: elogio + marca de ironia ou de espera vira reclamação.
  if (IRONY.test(norm)) return done("reclamacao", "negativo");
  if (PRICE.test(norm)) return done("preco", "neutro", true);
  if (COMPLAINT.test(norm)) return done("reclamacao", "negativo");
  if (OBJECTION.test(norm)) return done("objecao", "negativo");
  if (INTENT.test(norm)) return done("intencao", praise ? "positivo" : "neutro");
  const asks = QUESTION_START.test(norm);
  // "@amiga olha isso", "@a vamos?" = marcação; "@conta atende sábado?" = dúvida
  if (onlyMentions(norm) && !asks) return done("marcacao", praise ? "positivo" : "neutro", false);
  if (hasQ || asks) return done("duvida", "neutro", true);
  if (praise || (POSITIVE_EMOJI.test(raw) && letters.length <= 40 && !NEGATIVE_WORDS.test(norm))) return done("elogio", "positivo", false);
  if (NEGATIVE_WORDS.test(norm) || NEGATIVE_EMOJI.test(raw)) return done("outro", "negativo", false);
  return done("outro", "neutro", false);
}

export const rulesClassifier: CommentClassifier = {
  id: RULES_ID,
  label: "Classificação automática simples (por palavras-chave)",
  classify: async (items) => items.map((i) => classifyText(i.text)),
};
