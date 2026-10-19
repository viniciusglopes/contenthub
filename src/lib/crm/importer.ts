import type { Types } from "mongoose";
import { FriendlyError } from "@/lib/errors";
import { Contact } from "@/models/Automation";
import { type Actor, displayName, ownUser, upsertLead } from "./leads";
import { ownPipeline, firstOpenStage } from "./pipelines";
import { LIMITS, type Utm, cleanTags, fieldKey, guessMapping, normEmail, normPhone, parseCsv, parseMoney, slugKey } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

// IMPORTAR PLANILHA (CSV): 1) prévia com o mapa de colunas e o que vai acontecer em cada linha
// (novo, já existe = atualiza, repetido no arquivo, inválido); 2) confirmar grava.
// E-mail e telefone só entram se a pessoa que importa declarar a autorização (com a base: de onde
// vieram esses contatos). Sem isso, a planilha ainda entra (nome, @, etiquetas), sem e-mail/telefone.

type Org = Types.ObjectId;
const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);

const TARGETS = /^(ignore|name|email|phone|username|tags|value|stage|utm_(source|medium|campaign|term|content)|field:[a-z0-9_]{1,30})$/;

export interface ImportRow {
  line: number;
  status: "new" | "update" | "dup_file" | "invalid";
  message: string;
  name: string;
  email: string;
  phone: string;
  existing?: { _id: string; display: string };
}

export async function runImport(org: Org, b: Record<string, any>, by: Actor) {
  const csv = String(b.csv ?? "");
  if (!csv.trim()) throw bad("Escolha o arquivo CSV.", "csv");
  if (Buffer.byteLength(csv) > LIMITS.importBytes) throw bad("Arquivo grande demais (máximo 2 MB). Divida em partes.", "csv");
  const all = parseCsv(csv);
  if (all.length < 2) throw bad("A planilha precisa do cabeçalho e de pelo menos uma linha.", "csv");
  const header = all[0].map((h) => h.trim()).slice(0, 60);
  const rows = all.slice(1);
  if (rows.length > LIMITS.importRows) throw bad(`No máximo ${LIMITS.importRows} linhas por vez.`, "csv");
  const mapping: string[] = Array.isArray(b.mapping) && b.mapping.length ? b.mapping.map((m: unknown) => String(m ?? "ignore")) : guessMapping(header);
  if (mapping.length !== header.length) throw bad("O mapa de colunas não bate com o cabeçalho.", "mapping");
  mapping.forEach((m, i) => { if (!TARGETS.test(m)) throw bad(`Destino inválido na coluna ${header[i]}.`, "mapping"); });
  const used = mapping.filter((m) => m !== "ignore" && !m.startsWith("field:"));
  if (new Set(used).size !== used.length) throw bad("Duas colunas apontam para o mesmo campo.", "mapping");
  if (!mapping.some((m) => ["name", "email", "phone", "username"].includes(m))) throw bad("Diga qual coluna é o nome, o e-mail, o telefone ou o @.", "mapping");

  const consent = b.consent === true;
  const basis = String(b.consentBasis ?? "").trim().slice(0, 300);
  if (consent && basis.length < 3) throw bad("Diga de onde vieram esses contatos e como autorizaram (ex.: inscritos no evento X com aceite no formulário).", "consentBasis");
  const pipeline = await ownPipeline(org, b.pipeline || null);
  const defaultStage = b.stage ? (pipeline.stages || []).find((s: any) => s.key === b.stage) : firstOpenStage(pipeline);
  if (!defaultStage) throw bad("Etapa não existe neste funil.", "stage");
  const owner = b.owner ? await ownUser(org, b.owner) : null;
  const extraTags = cleanTags(b.tags);
  const stageByName = new Map<string, string>();
  for (const s of pipeline.stages || []) { stageByName.set(slugKey(s.name), s.key); stageByName.set(s.key, s.key); }

  const preview: ImportRow[] = [];
  const parsed: { line: number; input: any }[] = [];
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const counts = { total: rows.length, new: 0, update: 0, dup_file: 0, invalid: 0, droppedContact: 0, stageUnknown: 0 };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const v: any = { fields: {}, utm: {} as Utm, tags: [] as string[] };
    let problem = "";
    mapping.forEach((m, c) => {
      const cell = String(r[c] ?? "").trim();
      if (!cell || m === "ignore") return;
      if (m === "name") v.name = cell.slice(0, LIMITS.name);
      else if (m === "email") v.email = cell;
      else if (m === "phone") v.phone = cell;
      else if (m === "username") v.username = cell.replace(/^@/, "").slice(0, 60);
      else if (m === "tags") v.tags = cleanTags(cell.split(/[,;|]/));
      else if (m === "value") { const n = parseMoney(cell); if (n === null) problem ||= `valor "${cell.slice(0, 20)}" inválido`; else v.value = n; }
      else if (m === "stage") { const k = stageByName.get(slugKey(cell)); if (k) v.stage = k; else { v.stageUnknown = cell; } }
      else if (m.startsWith("utm_")) (v.utm as any)[m.slice(4)] = cell.slice(0, 120);
      else if (m.startsWith("field:")) v.fields[fieldKey(m.slice(6))] = cell.slice(0, LIMITS.fieldValue);
    });
    const email = v.email ? normEmail(v.email) : null;
    const ph = v.phone ? normPhone(v.phone) : null;
    if (v.email && !email) problem ||= `e-mail "${String(v.email).slice(0, 40)}" inválido`;
    if (v.phone && !ph) problem ||= `telefone "${String(v.phone).slice(0, 20)}" inválido`;
    if (!v.name && !email && !ph && !v.username) problem ||= "linha sem nome, e-mail, telefone ou @";
    const base = { line, name: v.name || v.username || "", email: email || "", phone: ph?.phone || "" };
    if (problem) { counts.invalid++; preview.push({ ...base, status: "invalid", message: problem }); continue; }
    if ((email && seenEmail.has(email)) || (ph && seenPhone.has(ph.key))) { counts.dup_file++; preview.push({ ...base, status: "dup_file", message: "repetida no arquivo: só a primeira entra" }); continue; }
    if (email) seenEmail.add(email);
    if (ph) seenPhone.add(ph.key);
    const or: any[] = [];
    if (email) or.push({ email });
    if (ph) or.push({ phoneKey: ph.key });
    if (v.username) or.push({ username: v.username });
    const existing: any = or.length ? await Contact.findOne({ organization: org, $or: or }).sort({ createdAt: 1 }).lean() : null;
    let message = existing ? "já existe: atualiza (completa o que falta e soma etiquetas)" : "novo lead";
    if ((email || ph) && !consent) { counts.droppedContact++; message += "; sem autorização declarada, e-mail/telefone não serão guardados"; }
    if (v.stageUnknown) { counts.stageUnknown++; message += `; etapa "${String(v.stageUnknown).slice(0, 20)}" não existe, entra em ${defaultStage.name}`; }
    counts[existing ? "update" : "new"]++;
    preview.push({ ...base, status: existing ? "update" : "new", message, ...(existing ? { existing: { _id: String(existing._id), display: displayName(existing) } } : {}) });
    parsed.push({ line, input: { ...v, email: email || "", phone: ph?.phone || "", contactId: existing?._id } });
  }

  if (b.commit !== true) return { header, mapping, counts, preview: preview.slice(0, 300), committed: false };

  const fileName = String(b.fileName ?? "planilha.csv").replace(/[^\w .-]/g, "").slice(0, 80) || "planilha.csv";
  const result = { created: 0, updated: 0, failed: 0 };
  const now = new Date();
  for (const { input } of parsed) {
    try {
      const r = await upsertLead(
        org,
        {
          name: input.name, email: input.email, phone: input.phone, username: input.username, contactId: input.contactId,
          tags: [...extraTags, ...(input.tags || [])], fields: input.fields, value: input.value ?? null,
          pipeline: pipeline._id, stage: input.stage || defaultStage.key, owner: owner?._id,
          source: "import",
          origin: { label: fileName },
          touch: { at: now, kind: "import", label: fileName, utm: input.utm, campaignId: "" },
          utm: input.utm,
          consent: consent ? { given: true, channel: "import", text: "Autorização declarada por quem importou a planilha.", basis: `${fileName}: ${basis}`, at: now } : null,
          eventKind: "import",
          eventText: `Importado da planilha ${fileName}.`,
        },
        by,
        now
      );
      result[r.created ? "created" : "updated"]++;
    } catch {
      result.failed++;
    }
  }
  return { header, mapping, counts, preview: preview.slice(0, 300), committed: true, result };
}

