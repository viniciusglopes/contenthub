import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

/* AUTOMAÇÕES DO DIRECT (estilo ManyChat), por conta do Instagram de cada cliente.
 *
 * Três chaves, as três desligadas por padrão:
 *   1) env AUTOMACOES_ENABLED=true (servidor inteiro)
 *   2) Organization.automationsEnabled (só o administrador liga, em Admin › Clientes)
 *   3) Automation.active (o cliente liga cada automação)
 * E o modo ensaio (`dryRun`, ligado por padrão): casa, registra o que ENVIARIA e não chama a Meta.
 *
 * Coleções:
 *   Automation       a regra (gatilho -> resposta pública -> DM -> pedir e-mail/telefone -> etiqueta)
 *   AutomationEvent  caixa de entrada do webhook, por organização, idempotente pelo id do evento
 *   AutomationRun    log de cada execução, passo a passo, com o erro da Meta quando houver
 *   AutomationLedger trava de "uma vez só" (1 DM por pessoa por post, 1 por comentário...)
 *   AutomationCounter teto por hora por conta
 *   TrackedLink      link com redirecionamento próprio para contar clique
 *   Contact          contato (IGSID, @, etiquetas, campos, consentimento, última mensagem recebida)
 */

const ButtonSchema = new Schema(
  {
    kind: { type: String, enum: ["url", "postback"], default: "url" },
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    /** link curto nosso (TrackedLink.code) que conta o clique antes de redirecionar */
    linkCode: { type: String, default: "" },
    /** botão de resposta (postback): o que responder e que etiqueta pôr */
    replyText: { type: String, default: "" },
    tag: { type: String, default: "" },
  },
  { _id: false }
);

const QuickReplySchema = new Schema(
  { title: { type: String, default: "" }, replyText: { type: String, default: "" }, tag: { type: String, default: "" } },
  { _id: false }
);

const AutomationSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    name: { type: String, required: true, trim: true },
    trigger: {
      /** comment = comentou no post; dm = mandou mensagem no direct */
      kind: { type: String, enum: ["comment", "dm"], default: "comment" },
      /** só para comment: um ou mais posts escolhidos, todos, ou o próximo post publicado */
      scope: { type: String, enum: ["posts", "all", "next"], default: "posts" },
      mediaIds: { type: [String], default: [] },
      /** escopo "próximo post": vale para o primeiro post publicado depois desta data */
      nextAfter: { type: Date, default: null },
      keywords: { type: [String], default: [] },
      /** word = palavra inteira (padrão), contains = contém, exact = a mensagem é só a palavra */
      match: { type: String, enum: ["word", "contains", "exact"], default: "word" },
      /** dispara em qualquer comentário/mensagem (sem palavra) */
      anyText: { type: Boolean, default: false },
    },
    /** até 3 respostas públicas, em rodízio */
    publicReplies: { type: [String], default: [] },
    dm: {
      text: { type: String, default: "" },
      buttons: { type: [ButtonSchema], default: [] },
      quickReplies: { type: [QuickReplySchema], default: [] },
    },
    /** passo opcional: pedir e-mail ou telefone, com consentimento explícito (LGPD) antes */
    ask: {
      enabled: { type: Boolean, default: false },
      field: { type: String, enum: ["email", "phone"], default: "email" },
      buttonTitle: { type: String, default: "Quero receber" },
      consentText: { type: String, default: "" },
      question: { type: String, default: "" },
      thanks: { type: String, default: "" },
    },
    /** etiquetas postas no contato quando a automação dispara */
    tags: { type: [String], default: [] },
    /** passo "Enviar para o CRM": o contato vira lead no funil, na etapa, com o responsável e as etiquetas */
    crm: {
      enabled: { type: Boolean, default: false },
      pipeline: { type: Schema.Types.ObjectId, ref: "Pipeline", default: null },
      stage: { type: String, default: "" },
      owner: { type: Schema.Types.ObjectId, ref: "User", default: null },
      tags: { type: [String], default: [] },
    },
    active: { type: Boolean, default: false },
    dryRun: { type: Boolean, default: true },
    rotation: { type: Number, default: 0 },
    stats: {
      matched: { type: Number, default: 0 },
      publicSent: { type: Number, default: 0 },
      dmSent: { type: Number, default: 0 },
      dryRuns: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      leads: { type: Number, default: 0 },
      lastRunAt: { type: Date, default: null },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
AutomationSchema.plugin(tenantPlugin, { model: "Automation" });
AutomationSchema.index({ account: 1, active: 1 });

const AutomationEventSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    /** id do evento na Meta (comentário, mid da mensagem ou do postback) com o tipo na frente */
    key: { type: String, required: true },
    field: { type: String, enum: ["comments", "messages", "messaging_postbacks", "simulado"], required: true },
    /** só o necessário do evento (ver lib/automations/webhook.ts `slim`) */
    data: { type: Schema.Types.Mixed, default: {} },
    eventAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "processing", "done", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    runAfter: { type: Date, default: () => new Date() },
    lockedAt: { type: Date, default: null },
    note: { type: String, default: "" },
    /** simulação pela tela: sempre em ensaio, mesmo com a automação ligada de verdade */
    simulated: { type: Boolean, default: false },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
AutomationEventSchema.plugin(tenantPlugin, { model: "AutomationEvent" });
AutomationEventSchema.index({ organization: 1, key: 1 }, { unique: true });
AutomationEventSchema.index({ status: 1, runAfter: 1 });
// O evento cru é dado de terceiros: some em 30 dias (o log da execução fica).
AutomationEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 });

const StepSchema = new Schema(
  {
    kind: { type: String, required: true }, // public_reply | private_reply | dm | tag | ask | consent | lead | optout
    status: { type: String, enum: ["sent", "dry_run", "skipped", "failed", "done"], required: true },
    detail: { type: String, default: "" },
    /** o que foi (ou seria) enviado, já sem token */
    payload: { type: Schema.Types.Mixed, default: null },
    metaId: { type: String, default: "" },
    metaError: { type: String, default: "" },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const AutomationRunSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    automation: { type: Schema.Types.ObjectId, ref: "Automation", default: null },
    automationName: { type: String, default: "" },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    eventKey: { type: String, default: "" },
    trigger: { type: String, default: "" }, // comment | dm | postback | quick_reply | input
    mediaIgId: { type: String, default: "" },
    commentId: { type: String, default: "" },
    username: { type: String, default: "" },
    /** trecho do que a pessoa escreveu (até 200 caracteres) */
    text: { type: String, default: "" },
    dryRun: { type: Boolean, default: true },
    simulated: { type: Boolean, default: false },
    status: { type: String, enum: ["done", "dry_run", "skipped", "failed", "partial"], default: "done" },
    steps: { type: [StepSchema], default: [] },
  },
  { timestamps: true }
);
AutomationRunSchema.plugin(tenantPlugin, { model: "AutomationRun" });
AutomationRunSchema.index({ organization: 1, createdAt: -1 });
AutomationRunSchema.index({ automation: 1, createdAt: -1 });
// Log de execução: 180 dias.
AutomationRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86_400 });

const AutomationLedgerSchema = new Schema(
  { account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true }, key: { type: String, required: true } },
  { timestamps: true }
);
AutomationLedgerSchema.plugin(tenantPlugin, { model: "AutomationLedger" });
AutomationLedgerSchema.index({ organization: 1, account: 1, key: 1 }, { unique: true });

const AutomationCounterSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    /** "dm" (private reply + direct) ou "public" (resposta pública) */
    kind: { type: String, required: true },
    /** hora cheia em UTC, AAAAMMDDHH */
    hour: { type: String, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);
AutomationCounterSchema.plugin(tenantPlugin, { model: "AutomationCounter" });
AutomationCounterSchema.index({ organization: 1, account: 1, kind: 1, hour: 1 }, { unique: true });
AutomationCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TrackedLinkSchema = new Schema(
  {
    automation: { type: Schema.Types.ObjectId, ref: "Automation", required: true },
    code: { type: String, required: true },
    url: { type: String, required: true },
    clicks: { type: Number, default: 0 },
    lastClickAt: { type: Date, default: null },
  },
  { timestamps: true }
);
TrackedLinkSchema.plugin(tenantPlugin, { model: "TrackedLink" });
TrackedLinkSchema.index({ organization: 1, code: 1 }, { unique: true });

// Toque (atribuição): de onde a pessoa veio numa interação. Primeiro e último ficam no contato.
const TouchSchema = new Schema(
  {
    at: { type: Date, default: null },
    /** mesmo vocabulário de `origin.kind` */
    kind: { type: String, default: "" },
    label: { type: String, default: "" },
    automation: { type: Schema.Types.ObjectId, ref: "Automation", default: null },
    campaignId: { type: String, default: "" },
    adsetId: { type: String, default: "" },
    adId: { type: String, default: "" },
    formId: { type: String, default: "" },
    postIgId: { type: String, default: "" },
    capture: { type: Schema.Types.ObjectId, default: null },
    utm: { source: String, medium: String, campaign: String, term: String, content: String },
  },
  { _id: false }
);

const ContactSchema = new Schema(
  {
    // Contato do Instagram (automações) tem conta + IGSID. Lead que entrou por outro caminho
    // (formulário da Meta, página de captura, cadastro à mão, planilha) nasce sem conta, com
    // `igsid` sintético "x:<id>" (só para o índice único continuar valendo; nunca vai à Meta).
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", default: null },
    project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    /** id da pessoa no escopo da conta (IGSID), que é o que a Meta manda no webhook */
    igsid: { type: String, required: true },
    username: { type: String, default: "" },
    name: { type: String, default: "" },
    /** telefone só com dígitos e sem o 55 (para achar duplicado); o `phone` guarda o formato +55... */
    phoneKey: { type: String, default: "" },
    /** chave opaca do link com clique contado (?k=), para o clique entrar na linha do tempo */
    clickKey: { type: String, default: "" },
    /** de onde a pessoa entrou pela primeira vez (ver lib/crm/sources.ts) */
    origin: {
      kind: { type: String, default: "" },
      label: { type: String, default: "" },
      automation: { type: Schema.Types.ObjectId, ref: "Automation", default: null },
      leadgenId: { type: String, default: "" },
      formId: { type: String, default: "" },
      pageId: { type: String, default: "" },
      adId: { type: String, default: "" },
      adsetId: { type: String, default: "" },
      campaignId: { type: String, default: "" },
      postIgId: { type: String, default: "" },
      ref: { type: String, default: "" },
      capture: { type: Schema.Types.ObjectId, default: null },
      url: { type: String, default: "" },
    },
    utm: { source: String, medium: String, campaign: String, term: String, content: String },
    firstTouch: { type: TouchSchema, default: null },
    lastTouch: { type: TouchSchema, default: null },
    /** CRM: entrou no funil? (contato do direct só vira lead pela automação ou à mão) */
    lead: { type: Boolean, default: false },
    leadAt: { type: Date, default: null },
    pipeline: { type: Schema.Types.ObjectId, ref: "Pipeline", default: null },
    /** chave da etapa dentro do funil */
    stage: { type: String, default: "" },
    stageAt: { type: Date, default: null },
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** valor do negócio em reais */
    value: { type: Number, default: null },
    lostReason: { type: String, default: "" },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
    mergedFrom: { type: [Schema.Types.ObjectId], default: [] },
    tags: { type: [String], default: [] },
    fields: { type: Schema.Types.Mixed, default: {} },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    /** consentimento (LGPD): quando, com que texto e qual versão do texto */
    consent: {
      given: { type: Boolean, default: false },
      at: { type: Date, default: null },
      text: { type: String, default: "" },
      version: { type: String, default: "" },
      automation: { type: Schema.Types.ObjectId, ref: "Automation", default: null },
      refusedAt: { type: Date, default: null },
      /** por onde veio o aceite: dm | meta_lead_form | landing | manual | import */
      channel: { type: String, default: "" },
    },
    /** pediu para parar: nenhuma mensagem automática sai mais para ele */
    optOutAt: { type: Date, default: null },
    /** como o contato foi criado (comment/dm/postback = direct; os outros vêm do CRM) */
    source: { type: String, enum: ["comment", "dm", "postback", "meta_lead_ads", "landing", "manual", "import"], default: "comment" },
    firstSeenAt: { type: Date, default: () => new Date() },
    /** última mensagem RECEBIDA dele: abre a janela de 24h para responder */
    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
    /** conversa no meio: pedindo consentimento ou o e-mail/telefone */
    pending: {
      automation: { type: Schema.Types.ObjectId, ref: "Automation", default: null },
      step: { type: String, enum: ["", "consent", "value"], default: "" },
      tries: { type: Number, default: 0 },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);
ContactSchema.plugin(tenantPlugin, { model: "Contact" });
ContactSchema.index({ organization: 1, account: 1, igsid: 1 }, { unique: true });
ContactSchema.index({ organization: 1, tags: 1 });
ContactSchema.index({ organization: 1, lead: 1, stage: 1 });
ContactSchema.index({ organization: 1, email: 1 });
ContactSchema.index({ organization: 1, phoneKey: 1 });
ContactSchema.index({ organization: 1, clickKey: 1 });
ContactSchema.index({ organization: 1, "origin.leadgenId": 1 });
// Lead sem Instagram: id sintético (não é IGSID; o motor nunca acha ninguém por ele).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ContactSchema.pre("validate", function (this: any) {
  if (!this.igsid) this.igsid = `x:${String(this._id)}`;
});

const m = mongoose.models;
export const Automation = m.Automation || mongoose.model("Automation", AutomationSchema);
export const AutomationEvent = m.AutomationEvent || mongoose.model("AutomationEvent", AutomationEventSchema);
export const AutomationRun = m.AutomationRun || mongoose.model("AutomationRun", AutomationRunSchema);
export const AutomationLedger = m.AutomationLedger || mongoose.model("AutomationLedger", AutomationLedgerSchema);
export const AutomationCounter = m.AutomationCounter || mongoose.model("AutomationCounter", AutomationCounterSchema);
export const TrackedLink = m.TrackedLink || mongoose.model("TrackedLink", TrackedLinkSchema);
export const Contact = m.Contact || mongoose.model("Contact", ContactSchema);

// Contagem do webhook por dia (sem dado de pessoa): recebidos, guardados, repetidos, conta
// desconhecida, assinatura inválida e "chave desligada". Não é dado de cliente.
const WebhookDailySchema = new Schema(
  {
    day: { type: String, required: true, unique: true },
    received: { type: Number, default: 0 },
    stored: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    unknownAccount: { type: Number, default: 0 },
    badSignature: { type: Number, default: 0 },
    switchedOff: { type: Number, default: 0 },
  },
  { timestamps: true }
);
export const WebhookDaily = m.WebhookDaily || mongoose.model("WebhookDaily", WebhookDailySchema);
