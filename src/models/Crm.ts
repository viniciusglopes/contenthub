import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

/* CRM DE LEADS (por organização). O lead é o próprio Contact (models/Automation.ts) com os campos
 * de funil; aqui ficam as peças em volta:
 *   Pipeline      funil com etapas editáveis (padrão: Novo, Em conversa, Proposta, Ganhou, Perdeu)
 *   LeadEvent     linha do tempo do lead (execução de automação, mensagem, clique, etapa, nota...)
 *   LeadTask      tarefa / lembrete do lead
 *   ConsentLog    registro de consentimento (LGPD): dado, recusado, revogado, apagado
 *   LeadCapture   formulário de captura (página própria / link rastreado) com endpoint público
 *   CaptureRate   teto de envios por IP (sem guardar o IP: só o hash)
 *   LeadAdsPage   Página do Facebook ligada ao CRM (token da Página criptografado)
 *   LeadAdsEvent  caixa de entrada do webhook leadgen, idempotente pelo leadgen_id
 */

const StageSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    /** open = em andamento; won = ganhou (venda); lost = perdeu */
    kind: { type: String, enum: ["open", "won", "lost"], default: "open" },
    color: { type: String, default: "" },
  },
  { _id: false }
);

const PipelineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    stages: { type: [StageSchema], default: [] },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);
PipelineSchema.plugin(tenantPlugin, { model: "Pipeline" });
PipelineSchema.index({ organization: 1, name: 1 }, { unique: true });

const LeadEventSchema = new Schema(
  {
    contact: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    /** created | automation | message | click | referral | stage | owner | value | note | task | merge | import | lead_ads | capture | consent | edit */
    kind: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" },
    text: { type: String, default: "" },
    data: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: false }
);
LeadEventSchema.plugin(tenantPlugin, { model: "LeadEvent" });
LeadEventSchema.index({ organization: 1, contact: 1, at: -1 });
LeadEventSchema.index({ organization: 1, kind: 1, at: -1 });

const LeadTaskSchema = new Schema(
  {
    contact: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    title: { type: String, required: true, trim: true },
    dueAt: { type: Date, default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    assignee: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
LeadTaskSchema.plugin(tenantPlugin, { model: "LeadTask" });
LeadTaskSchema.index({ organization: 1, contact: 1 });
LeadTaskSchema.index({ organization: 1, done: 1, dueAt: 1 });

const ConsentLogSchema = new Schema(
  {
    /** fica mesmo depois do contato apagado (sem dado pessoal: só o id antigo) */
    contact: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, enum: ["given", "refused", "revoked", "erased", "exported"], required: true },
    /** dm | meta_lead_form | landing | manual | import */
    channel: { type: String, default: "" },
    /** o que foi autorizado: email, phone, email+phone */
    fields: { type: String, default: "" },
    text: { type: String, default: "" },
    version: { type: String, default: "" },
    /** detalhe da base: "formulário 123", "planilha leads.csv", "por telefone em 10/10" */
    basis: { type: String, default: "" },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);
ConsentLogSchema.plugin(tenantPlugin, { model: "ConsentLog" });
ConsentLogSchema.index({ organization: 1, contact: 1, at: -1 });

const LeadCaptureSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** código sorteado (64 bits) do endereço público /api/captura/<org>/<code> */
    code: { type: String, required: true },
    pipeline: { type: Schema.Types.ObjectId, ref: "Pipeline", default: null },
    stage: { type: String, default: "" },
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null },
    tags: { type: [String], default: [] },
    /** pedir telefone, e-mail ou os dois */
    ask: { type: String, enum: ["email", "phone", "both"], default: "both" },
    consentText: { type: String, default: "" },
    /** para onde mandar a pessoa depois de enviar (página de obrigado) */
    redirectUrl: { type: String, default: "" },
    /** post do Instagram que divulga esta captura (para o relatório por post) */
    postIgId: { type: String, default: "" },
    active: { type: Boolean, default: true },
    submissions: { type: Number, default: 0 },
    lastAt: { type: Date, default: null },
  },
  { timestamps: true }
);
LeadCaptureSchema.plugin(tenantPlugin, { model: "LeadCapture" });
LeadCaptureSchema.index({ organization: 1, code: 1 }, { unique: true });

const CaptureRateSchema = new Schema(
  {
    key: { type: String, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);
CaptureRateSchema.plugin(tenantPlugin, { model: "CaptureRate" });
CaptureRateSchema.index({ organization: 1, key: 1 }, { unique: true });
CaptureRateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LeadAdsPageSchema = new Schema(
  {
    pageId: { type: String, required: true },
    name: { type: String, default: "" },
    /** token DA PÁGINA (leads_retrieval), criptografado */
    credentials: { accessToken: String },
    active: { type: Boolean, default: true },
    pipeline: { type: Schema.Types.ObjectId, ref: "Pipeline", default: null },
    stage: { type: String, default: "" },
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null },
    tags: { type: [String], default: [] },
    /** nome do campo no formulário da Meta -> name | email | phone | ignore | field:<chave> */
    fieldMap: { type: Schema.Types.Mixed, default: {} },
    lastLeadAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true, minimize: false }
);
LeadAdsPageSchema.plugin(tenantPlugin, { model: "LeadAdsPage" });
LeadAdsPageSchema.index({ organization: 1, pageId: 1 }, { unique: true });
LeadAdsPageSchema.index({ pageId: 1 });

const LeadAdsEventSchema = new Schema(
  {
    page: { type: Schema.Types.ObjectId, ref: "LeadAdsPage", required: true },
    pageId: { type: String, required: true },
    leadgenId: { type: String, required: true },
    formId: { type: String, default: "" },
    adId: { type: String, default: "" },
    adgroupId: { type: String, default: "" },
    createdTime: { type: Date, default: null },
    status: { type: String, enum: ["pending", "processing", "done", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    runAfter: { type: Date, default: () => new Date() },
    lockedAt: { type: Date, default: null },
    note: { type: String, default: "" },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
LeadAdsEventSchema.plugin(tenantPlugin, { model: "LeadAdsEvent" });
LeadAdsEventSchema.index({ organization: 1, leadgenId: 1 }, { unique: true });
LeadAdsEventSchema.index({ status: 1, runAfter: 1 });

const m = mongoose.models;
export const Pipeline = m.Pipeline || mongoose.model("Pipeline", PipelineSchema);
export const LeadEvent = m.LeadEvent || mongoose.model("LeadEvent", LeadEventSchema);
export const LeadTask = m.LeadTask || mongoose.model("LeadTask", LeadTaskSchema);
export const ConsentLog = m.ConsentLog || mongoose.model("ConsentLog", ConsentLogSchema);
export const LeadCapture = m.LeadCapture || mongoose.model("LeadCapture", LeadCaptureSchema);
export const CaptureRate = m.CaptureRate || mongoose.model("CaptureRate", CaptureRateSchema);
export const LeadAdsPage = m.LeadAdsPage || mongoose.model("LeadAdsPage", LeadAdsPageSchema);
export const LeadAdsEvent = m.LeadAdsEvent || mongoose.model("LeadAdsEvent", LeadAdsEventSchema);
