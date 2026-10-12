import mongoose, { Schema } from "mongoose";

// Registro do que mexe em acesso: impersonação, convites, clientes, senhas.
const AuditLogSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, default: "" },
    organization: { type: Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    target: { type: String, default: "" },
    ip: { type: String, default: "" },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
