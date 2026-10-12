import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted, loadKey, publicCredentials, sealCredentials } from "@/lib/crypto";
import { checkCronToken, createSessionToken, hashPassword, passwordProblem, readSessionToken, readState, signState, verifyPassword, verifySessionToken } from "@/lib/auth";

const key = loadKey("a".repeat(64));

describe("criptografia em repouso", () => {
  it("vai e volta, e cada gravação sai diferente", () => {
    const a = encrypt("IGAAtoken-secreto", key);
    const b = encrypt("IGAAtoken-secreto", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("IGAAtoken");
    expect(isEncrypted(a)).toBe(true);
    expect(decrypt(a, key)).toBe("IGAAtoken-secreto");
  });

  it("recusa chave errada e dado adulterado", () => {
    const a = encrypt("segredo", key);
    expect(() => decrypt(a, loadKey("b".repeat(64)))).toThrow();
    const parts = a.split(":");
    parts[4] = Buffer.from("outro").toString("base64url");
    expect(() => decrypt(parts.join(":"), key)).toThrow();
  });

  it("lê valor legado em texto puro sem quebrar", () => {
    expect(decrypt("valor-antigo", key)).toBe("valor-antigo");
  });

  it("aceita chave em hex, base64 e frase; recusa ausente", () => {
    expect(loadKey("a".repeat(64))).toHaveLength(32);
    expect(loadKey(Buffer.alloc(32, 7).toString("base64"))).toHaveLength(32);
    expect(loadKey("uma frase longa qualquer de chave")).toHaveLength(32);
    expect(() => loadKey("")).toThrow(/CONTENTHUB_ENC_KEY/);
  });

  it("sela só os campos sensíveis e nunca devolve segredo", () => {
    const sealed = sealCredentials({ appId: "123", appSecret: "s3", accessToken: "tok", pageId: "", apiKey: "k" }, key);
    expect(sealed.appId).toBe("123");
    expect(isEncrypted(sealed.appSecret)).toBe(true);
    expect(isEncrypted(sealed.accessToken)).toBe(true);
    expect(isEncrypted(sealed.apiKey)).toBe(true);
    expect(sealed).not.toHaveProperty("pageId");
    const pub = publicCredentials({ ...sealed, legacyToken: "texto-puro" });
    expect(pub.values).toEqual({ appId: "123" });
    expect(pub.filled).toMatchObject({ appSecret: true, accessToken: true, legacyToken: true });
    expect(JSON.stringify(pub)).not.toContain("texto-puro");
  });
});

describe("sessão e token de rotina", () => {
  const secret = "segredo-de-sessao-com-32-caracteres!";
  const uid = "a".repeat(24);
  it("valida cookie assinado e recusa adulterado, vencido ou de outra chave", () => {
    const t = createSessionToken({ uid, sv: 1 }, 1_000, secret);
    expect(verifySessionToken(t, 2_000, secret)).toBe(true);
    expect(readSessionToken(t, 2_000, secret)).toMatchObject({ uid, sv: 1 });
    expect(verifySessionToken(t, 1_000 + 31 * 86_400_000, secret)).toBe(false);
    expect(verifySessionToken(t, 2_000, "outra-chave-de-sessao-qualquer!!")).toBe(false);
    // trocar o usuário (ou acrescentar "entrar como") no cookie sem a chave: recusado
    const forged = Buffer.from(JSON.stringify({ uid: "b".repeat(24), sv: 1, imp: "c".repeat(24), exp: 9e15 })).toString("base64url") + "." + t.split(".")[1];
    expect(verifySessionToken(forged, 2_000, secret)).toBe(false);
    expect(verifySessionToken("", 2_000, secret)).toBe(false);
    expect(verifySessionToken(t, 2_000, "")).toBe(false);
  });

  it("state do OAuth não serve de sessão, nem sessão de state", () => {
    const state = signState({ uid, sv: 1 }, 60_000, 1_000, secret);
    expect(readState(state, 2_000, secret)).toMatchObject({ uid });
    expect(verifySessionToken(state, 2_000, secret)).toBe(false);
    expect(readState(createSessionToken({ uid, sv: 1 }, 1_000, secret), 2_000, secret)).toBeNull();
    expect(readState(state, 1_000 + 61_000, secret)).toBeNull();
  });

  it("senha: scrypt com sal, confere a certa e recusa a errada", async () => {
    const h = await hashPassword("senha-forte-123");
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(h).not.toContain("senha-forte");
    expect(await hashPassword("senha-forte-123")).not.toBe(h);
    expect(await verifyPassword("senha-forte-123", h)).toBe(true);
    expect(await verifyPassword("senha-forte-124", h)).toBe(false);
    expect(await verifyPassword("senha-forte-123", "texto-qualquer")).toBe(false);
    expect(passwordProblem("curta1")).toMatch(/pelo menos/);
    expect(passwordProblem("somenteletrasaqui")).toMatch(/letras e números/);
    expect(passwordProblem("senha-forte-123")).toBe("");
  });

  it("token de rotina só com Bearer exato", () => {
    process.env.CRON_TOKEN = "token-de-rotina-123456";
    expect(checkCronToken("Bearer token-de-rotina-123456")).toBe(true);
    expect(checkCronToken("Bearer errado")).toBe(false);
    expect(checkCronToken(null)).toBe(false);
    process.env.CRON_TOKEN = "";
    expect(checkCronToken("Bearer ")).toBe(false);
  });
});
