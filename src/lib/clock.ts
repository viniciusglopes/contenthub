// Relógio do fluxo de publicação. Em produção é o relógio de verdade; os testes trocam por um
// relógio próprio para "andar no tempo" (agendar para daqui a 30 minutos e conferir sem esperar).
let override: (() => number) | null = null;
export const nowMs = (): number => (override ? override() : Date.now());
export function setClock(fn: (() => number) | null): void {
  override = fn;
}
