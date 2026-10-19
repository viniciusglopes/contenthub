import mongoose, { Schema } from "mongoose";

// Cliente do ContentHub (white label). Tudo que é dado de cliente aponta para uma organização.
const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    brand: {
      displayName: { type: String, default: "" }, // vazio = "ContentHub"
      logo: { type: String, default: "" }, // https://... ou data:image/...;base64
      color: { type: String, default: "" }, // #rrggbb; vazio = cor padrão
    },
    active: { type: Boolean, default: true },
    // Publicação automática no Instagram: desligada por padrão; só o administrador da plataforma liga.
    publishEnabled: { type: Boolean, default: false },
    // Responder comentário pelo ContentHub: desligado por padrão; só o administrador da plataforma liga.
    commentReplyEnabled: { type: Boolean, default: false },
    // Tráfego: pausar, mudar orçamento e criar anúncio pela Meta. Desligado por padrão; só o
    // administrador da plataforma liga, e só vale com a env TRAFEGO_WRITE_ENABLED=true também.
    adsWriteEnabled: { type: Boolean, default: false },
    // Automações do direct (comentou PALAVRA -> resposta + DM). Desligado por padrão; só o
    // administrador liga, e só vale com a env AUTOMACOES_ENABLED=true também.
    automationsEnabled: { type: Boolean, default: false },
    // Classificação por IA (etapa seguinte): ordem dos provedores a tentar, em sequência.
    // As chaves ficam em ApiCredential (criptografadas, uma por serviço por organização).
    ai: {
      commentProviders: { type: [String], default: [] },
      enabled: { type: Boolean, default: false },
      // Estúdio: ordem de preferência dos provedores por finalidade ({ texto: ["anthropic", "google"], ... })
      chains: { type: Schema.Types.Mixed, default: {} },
    },
    // Estúdio: teto mensal de gasto com IA em dólar (null = o padrão da plataforma; só o
    // administrador altera) e se pode usar as chaves da casa quando não tem a própria.
    studio: {
      capUsd: { type: Number, default: null },
      useHouse: { type: Boolean, default: true },
      /** setor regulado: libera imagem e vídeo gerados por IA para esta conta (só o administrador) */
      aiVisuals: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Organization || mongoose.model("Organization", OrganizationSchema);
