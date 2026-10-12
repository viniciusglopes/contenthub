import mongoose, { Schema } from "mongoose";

export const ROLES = ["platform_admin", "owner", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  platform_admin: "Administrador da plataforma",
  owner: "Dono",
  member: "Membro",
};

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: "member" },
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    passwordSetAt: { type: Date, default: null },
    // Trocar a senha ou desativar soma 1 aqui: os cookies antigos param de valer.
    sessionVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
