import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// Comentário (ou resposta) de uma mídia do Instagram. DADO DE TERCEIROS: guarda só o necessário
// para ler, estudar e responder: o @ de quem escreveu, o texto, a data e os contadores.
// Não guarda o id de usuário do autor, foto nem perfil. Some junto com a conta (ver purgeComments).
const InstagramCommentSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    mediaIgId: { type: String, required: true },
    igId: { type: String, required: true },
    /** id do comentário de primeiro nível quando este é uma resposta; null = primeiro nível */
    parentIgId: { type: String, default: null },
    username: { type: String, default: "" },
    text: { type: String, default: "" },
    timestamp: { type: Date, required: true },
    likeCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false },
    /** escrito pela própria conta conectada */
    own: { type: Boolean, default: false },
    /** (primeiro nível) a conta já respondeu, e quando foi a primeira resposta */
    answered: { type: Boolean, default: false },
    answeredAt: { type: Date, default: null },
    /** classificação guardada (só quando vier de IA; a de regras é calculada na leitura) */
    cls: { type: Schema.Types.Mixed, default: null },
    /** resposta enviada pelo ContentHub: quem e quando */
    sentBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sentByName: { type: String, default: "" },
  },
  { timestamps: true }
);
InstagramCommentSchema.plugin(tenantPlugin, { model: "InstagramComment" });
InstagramCommentSchema.index({ account: 1, igId: 1 }, { unique: true });
InstagramCommentSchema.index({ account: 1, mediaIgId: 1, timestamp: 1 });
InstagramCommentSchema.index({ account: 1, timestamp: 1 });

export default mongoose.models.InstagramComment || mongoose.model("InstagramComment", InstagramCommentSchema);
