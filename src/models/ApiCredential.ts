import mongoose from "mongoose";

const ApiCredentialSchema = new mongoose.Schema(
  {
    service: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    credentials: { type: Map, of: String, default: {} },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.ApiCredential ||
  mongoose.model("ApiCredential", ApiCredentialSchema);
