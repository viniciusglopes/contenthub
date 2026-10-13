// REGRAS DE SETOR: catálogo NOSSO (o cliente escolhe o setor, não edita as regras).
// "odontologia" vem de docs/estudio-regras-odontologia.md (Código de Ética CFO 118/2012 e
// Resolução 196/2019, lidos em fontes secundárias em 12/10/2026; não é parecer jurídico).
// Arquivo puro: serve ao servidor e à tela.

export interface Veto { pattern: string; reason: string }
export interface Sector {
  label: string;
  /** toda peça leva nome, profissão e número de inscrição no conselho */
  requiresRegistration: boolean;
  registrationLabel: string;
  captionNote: string;
  summary: string[];
  vetoes: Veto[];
  /** imagem gerada por IA: em setor regulado, rosto ou sorriso gerado pode ser lido como resultado de tratamento */
  aiImagesAllowed: boolean;
}

/** Vale para qualquer cliente (regra da casa): nada de travessão em texto que vai ao público. */
export const HOUSE_VETOES: Veto[] = [{ pattern: "[—–―]", reason: "travessão (use vírgula ou ponto)" }];

export const SECTORS: Record<string, Sector> = {
  geral: {
    label: "Geral (sem conselho profissional)",
    requiresRegistration: false,
    registrationLabel: "Registro profissional (se houver)",
    captionNote: "",
    aiImagesAllowed: true,
    summary: [
      "Não invente depoimento, número, estatística, preço, prazo nem resultado.",
      "Não prometa resultado garantido nem use urgência falsa de venda.",
      "Não cite marcas de terceiros nem critique concorrentes.",
    ],
    vetoes: [
      { pattern: "garantid|100\\s?%|milagr", reason: "promessa de resultado" },
      { pattern: "últimas vagas|só hoje|imperd[ií]vel", reason: "urgência falsa de venda" },
    ],
  },
  odontologia: {
    label: "Odontologia (regras do CFO)",
    requiresRegistration: true,
    registrationLabel: "Inscrição no CRO, com a UF (ex.: CRO-SP 12345)",
    captionNote: "Conteúdo informativo, não substitui a avaliação presencial.",
    aiImagesAllowed: false,
    summary: [
      "Conteúdo só de esclarecimento e educação: nada de consulta, diagnóstico ou indicação de tratamento para um caso específico.",
      "Não prometer resultado nem prazo; não usar sensacionalismo, autopromoção ou superlativo (o melhor, referência, número 1).",
      "Não divulgar preço, forma de pagamento, desconto, serviço gratuito, brinde ou sorteio.",
      "Não usar expressões nem imagens de antes e depois. Nenhuma imagem de paciente.",
      "Não mostrar procedimento em andamento, equipamento, instrumental, material ou tecido biológico.",
      "Não criticar técnicas de outros profissionais nem anunciar técnica sem comprovação científica ou especialidade que o dentista não tenha registrada.",
      "Toda peça leva o nome do profissional, a profissão e o número de inscrição no conselho.",
    ],
    vetoes: [
      { pattern: "\\b(o|a|os|as) melhor(es)?\\b", reason: "superlativo, autopromoção" },
      { pattern: "n[úu]mero 1|nº ?1|refer[êe]ncia em|\\bl[íi]der", reason: "autopromoção" },
      { pattern: "garant|100\\s?%|milagr|perfeit|sem dor|indolor", reason: "promessa de resultado" },
      { pattern: "resultados? (imediato|rápido|definitivo)s?", reason: "promessa de resultado" },
      { pattern: "R\\$|\\bpreços?\\b|parcel|desconto|promo[cç]|gr[aá]tis|gratuit|cortesia|\\bofertas?\\b|brinde|sorteio", reason: "preço, pagamento ou vantagem comercial" },
      { pattern: "antes e depois|antes\\s*[/x]\\s*depois", reason: "expressão de antes e depois" },
      { pattern: "\\bpopular(es)?\\b", reason: "expressão vetada pelo código de ética" },
      { pattern: "últimas vagas|só hoje|imperd|corra\\b", reason: "sensacionalismo, urgência de venda" },
    ],
  },
};

export const sectorOf = (id: unknown): Sector => SECTORS[String(id)] || SECTORS.geral;

/** Termos vetados encontrados num texto (regra da casa + setor). Vazio = texto liberado. */
export function vetoHits(text: string, sector: Sector): { match: string; reason: string }[] {
  const out: { match: string; reason: string }[] = [];
  for (const v of [...HOUSE_VETOES, ...sector.vetoes]) {
    const m = new RegExp(v.pattern, "iu").exec(text);
    if (m) out.push({ match: m[0], reason: v.reason });
  }
  return out;
}
