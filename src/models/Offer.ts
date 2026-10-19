import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// OFERTAS (Concorrentes › Ofertas): páginas anunciantes acompanhadas pela contagem diária de
// anúncios ativos. Duas listas com o mesmo formato:
//   OfferPage / OfferDaily       lista da ORGANIZAÇÃO (tenant)
//   HouseOffer / HouseOfferDaily "lista da casa", mantida pelo administrador da plataforma e
//                                vista (só leitura) por quem tem Organization.offersEnabled
// A contagem vem da API oficial da Biblioteca de Anúncios (ads_archive) ou é digitada por uma
// pessoa ("contagem manual"). NUNCA de leitura automatizada das páginas públicas da Biblioteca.

const tags = {
  /** vsl | pagina_vendas | quiz | outro | "" */
  structure: { type: String, default: "" },
  /** info | nutra | ecommerce | servico | outro | "" */
  niche: { type: String, default: "" },
  /** texto livre: o produto (ex.: "chá para emagrecer") */
  product: { type: String, default: "" },
  /** pt | es | en | outro | "" */
  language: { type: String, default: "" },
  /** países onde a oferta roda (ISO de 2 letras, ex.: BR, PT, US) */
  countries: { type: [String], default: [] },
};

const pageFields = {
  name: { type: String, required: true, trim: true },
  /** id numérico da página do Facebook (obrigatório para contar pela API) */
  pageId: { type: String, default: "" },
  /** link da página da oferta (site, VSL, quiz) */
  offerUrl: { type: String, default: "" },
  tags,
  /** api = conta pela Biblioteca de Anúncios todo dia; manual = alguém digita a contagem */
  counting: { type: String, enum: ["api", "manual"], default: "api" },
  notes: { type: String, default: "" },
  /** resumo da última contagem: { date, count, source, complete, countries, at, error } */
  last: { type: Schema.Types.Mixed, default: null },
};

const dailyFields = {
  date: { type: String, required: true },
  count: { type: Number, required: true },
  /** api | manual */
  source: { type: String, enum: ["api", "manual"], required: true },
  /** false = a paginação parou no teto: a contagem é "pelo menos N" */
  complete: { type: Boolean, default: true },
  /** países pedidos à API (ad_reached_countries) */
  countries: { type: [String], default: [] },
  calls: { type: Number, default: 0 },
  at: { type: Date, default: Date.now },
  /** contagem manual: quem registrou (id e nome) e a observação de onde veio */
  byUser: { type: Schema.Types.ObjectId, default: null },
  byName: { type: String, default: "" },
  note: { type: String, default: "" },
};

const OfferPageSchema = new Schema({ ...pageFields, createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null } }, { timestamps: true });
OfferPageSchema.plugin(tenantPlugin, { model: "OfferPage" });

const OfferDailySchema = new Schema({ page: { type: Schema.Types.ObjectId, ref: "OfferPage", required: true }, ...dailyFields }, { timestamps: true });
OfferDailySchema.plugin(tenantPlugin, { model: "OfferDaily" });
OfferDailySchema.index({ page: 1, date: 1 }, { unique: true });

// Favorito é por USUÁRIO (dentro da organização). kind "org" aponta para OfferPage, "casa" para HouseOffer.
const OfferFavoriteSchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: "User", required: true }, kind: { type: String, enum: ["org", "casa"], required: true }, ref: { type: Schema.Types.ObjectId, required: true } },
  { timestamps: true }
);
OfferFavoriteSchema.plugin(tenantPlugin, { model: "OfferFavorite" });
OfferFavoriteSchema.index({ organization: 1, user: 1, kind: 1, ref: 1 }, { unique: true });

// ---- lista da casa (dado da plataforma, sem organização; só o administrador escreve)
const HouseOfferSchema = new Schema({ ...pageFields, active: { type: Boolean, default: true }, addedBy: { type: String, default: "" } }, { timestamps: true });
const HouseOfferDailySchema = new Schema({ page: { type: Schema.Types.ObjectId, ref: "HouseOffer", required: true }, ...dailyFields }, { timestamps: true });
HouseOfferDailySchema.index({ page: 1, date: 1 }, { unique: true });

export const OfferPage = mongoose.models.OfferPage || mongoose.model("OfferPage", OfferPageSchema);
export const OfferDaily = mongoose.models.OfferDaily || mongoose.model("OfferDaily", OfferDailySchema);
export const OfferFavorite = mongoose.models.OfferFavorite || mongoose.model("OfferFavorite", OfferFavoriteSchema);
export const HouseOffer = mongoose.models.HouseOffer || mongoose.model("HouseOffer", HouseOfferSchema);
export const HouseOfferDaily = mongoose.models.HouseOfferDaily || mongoose.model("HouseOfferDaily", HouseOfferDailySchema);
