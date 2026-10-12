import mongoose, { Schema } from "mongoose";

// Link de convite (ou de nova senha). Só o HASH do código fica no banco:
// quem lê o banco não consegue montar o link.
const InviteSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["owner", "member", "reset"], required: true },
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: { type: String, default: "", lowercase: true, trim: true }, // preenchido = só esse e-mail pode usar
    name: { type: String, default: "" },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null }, // kind=reset
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Invite || mongoose.model("Invite", InviteSchema);
