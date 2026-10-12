import mongoose, { Schema, Types } from "mongoose";

// ISOLAMENTO POR ORGANIZAÇÃO (white label).
// Todo modelo de dado de cliente usa este plugin: ganha o campo `organization` obrigatório
// e passa a RECUSAR qualquer consulta, alteração ou exclusão que não diga de qual
// organização é. Esquecer o filtro vira erro na hora, nunca vazamento entre clientes.
// A única saída é `.setOptions({ crossOrg: true })`, usada só pela migração e pela
// contagem de órfãos do administrador.

export class TenantScopeError extends Error {
  constructor(model: string, op: string) {
    super(`Consulta sem organização bloqueada: ${model}.${op}`);
    this.name = "TenantScopeError";
  }
}

export const TENANT_MODELS: string[] = [];

const QUERY_OPS = [
  "find",
  "findOne",
  "countDocuments",
  "distinct",
  "deleteOne",
  "deleteMany",
  "updateOne",
  "updateMany",
  "replaceOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
] as const;

function hasOrg(filter: Record<string, unknown> | null | undefined): boolean {
  const v = filter?.organization as unknown;
  if (v == null) return false;
  if (v instanceof Types.ObjectId) return true;
  if (typeof v === "string") return Types.ObjectId.isValid(v);
  // Só igualdade: operadores ($ne, $in, $exists...) não contam como filtro de organização.
  return false;
}

export function tenantPlugin(schema: Schema, opts: { model: string }) {
  schema.add({
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true, immutable: true },
  });
  if (!TENANT_MODELS.includes(opts.model)) TENANT_MODELS.push(opts.model);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  schema.pre(QUERY_OPS as unknown as "find", function (this: any) {
    const options = this.getOptions();
    if (options.crossOrg === true) {
      delete this.options.crossOrg;
      return;
    }
    if (!hasOrg(this.getFilter())) throw new TenantScopeError(opts.model, this.op || "consulta");
    // Ninguém move um registro de organização por update.
    const update = typeof this.getUpdate === "function" ? this.getUpdate() : null;
    if (update && !Array.isArray(update)) {
      const org = String(this.getFilter().organization);
      for (const part of [update, update.$set, update.$setOnInsert]) {
        if (part && part.organization != null && String(part.organization) !== org)
          throw new TenantScopeError(opts.model, "mudar organização");
      }
      if (update.$unset && "organization" in update.$unset) throw new TenantScopeError(opts.model, "remover organização");
    }
  });
  schema.pre("aggregate", function (this: any) {
    if (this.options?.crossOrg === true) {
      delete this.options.crossOrg;
      return;
    }
    const first = this.pipeline()[0];
    if (!first?.$match || !hasOrg(first.$match)) throw new TenantScopeError(opts.model, "aggregate");
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Converte um id vindo de fora em ObjectId; id malformado devolve null (a rota responde 404). */
export function toObjectId(id: unknown): Types.ObjectId | null {
  if (id instanceof Types.ObjectId) return id;
  if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) return null;
  return new mongoose.Types.ObjectId(id);
}
