// Erro com mensagem pronta para a tela (em português) e o status HTTP certo.
export class FriendlyError extends Error {
  status: number;
  field?: string;
  constructor(message: string, status = 400, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/** Registro que não existe OU é de outra organização: a resposta é a mesma (404). */
export function notFound(what = "Registro"): FriendlyError {
  return new FriendlyError(`${what} não encontrado.`, 404);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Qualquer erro -> mensagem em português com o status certo. */
export function toFriendly(e: unknown): FriendlyError {
  if (e instanceof FriendlyError) return e;
  const err = e as any;
  if (err?.name === "InstagramApiError") {
    const status = err.kind === "limite" ? 429 : err.kind === "rede" || err.kind === "temporario" ? 502 : 400;
    return new FriendlyError(err.friendly, status, err.kind === "token_invalido" ? "token" : undefined);
  }
  if (err?.name === "CryptoConfigError") return new FriendlyError(err.message, 503);
  if (err?.name === "CastError") return notFound();
  if (err?.name === "ValidationError") {
    const first: any = Object.values(err.errors || {})[0];
    const field = first?.path ? String(first.path) : undefined;
    if (first?.name === "CastError" && first?.kind === "ObjectId") return notFound();
    return new FriendlyError(field ? `Confira o campo "${field}".` : "Dados inválidos.", 400, field);
  }
  if (err?.code === 11000) return new FriendlyError("Já existe um registro igual a esse.", 409);
  return new FriendlyError("Algo deu errado no servidor. Tente de novo; se continuar, avise o suporte.", 500);
}

