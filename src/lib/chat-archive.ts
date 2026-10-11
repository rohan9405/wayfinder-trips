/** Server-side, read-only archive for the admin view. Production uses the existing D1 account. */
export interface ArchivedMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ArchivedChat {
  id: string;
  owner: string;
  title: string;
  messages: ArchivedMessage[];
  pendingRunId: string | null;
  createdAt: number;
  updatedAt: number;
}

const memory = new Map<string, ArchivedChat>();
let schema: Promise<void> | null = null;

function configured() {
  return process.env.VERCEL_ENV === "production" && Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN && process.env.D1_DATABASE_ID,
  );
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.D1_DATABASE_ID}/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json() as { success?: boolean; errors?: unknown[]; result?: { results?: T[] }[] };
  if (!response.ok || !body.success) throw new Error(`Chat archive D1 error: ${response.status} ${JSON.stringify(body.errors).slice(0, 160)}`);
  return body.result?.[0]?.results ?? [];
}

async function ready() {
  if (!configured()) return;
  schema ??= query("CREATE TABLE IF NOT EXISTS chat_archive (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, messages TEXT NOT NULL, pending_run_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").then(() => undefined).catch((error) => {
    schema = null;
    throw error;
  });
  await schema;
}

function toMessages(raw: unknown): ArchivedMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((message) => {
    if (!message || (message.role !== "user" && message.role !== "assistant")) return [];
    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.filter((part: { type?: string }) => part?.type === "text").map((part: { text?: string }) => part.text ?? "").join("\n")
        : "";
    return content ? [{ role: message.role as ArchivedMessage["role"], content }] : [];
  });
}

function title(messages: ArchivedMessage[]) {
  const first = messages.find((message) => message.role === "user")?.content ?? "Untitled chat";
  return first.replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled chat";
}

export async function saveChat(input: { id: string; owner: string; messages: unknown; runId?: string | null; title?: string; onlyIfAbsent?: boolean }) {
  if (!/^[\w-]{8,64}$/.test(input.id)) return;
  const messages = toMessages(input.messages);
  if (!messages.length) return;
  const now = Date.now();
  const chat: ArchivedChat = {
    id: input.id,
    owner: input.owner,
    title: input.title?.slice(0, 80) || title(messages),
    messages,
    pendingRunId: input.runId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  if (!configured()) {
    const old = memory.get(input.id);
    if (old && input.onlyIfAbsent) return;
    if (old && old.owner !== input.owner) return;
    memory.set(input.id, { ...chat, createdAt: old?.createdAt ?? now });
    return;
  }
  await ready();
  await query(
    input.onlyIfAbsent
      ? "INSERT INTO chat_archive (id, owner, title, messages, pending_run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING"
      : "INSERT INTO chat_archive (id, owner, title, messages, pending_run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, messages=excluded.messages, pending_run_id=excluded.pending_run_id, updated_at=excluded.updated_at WHERE owner=excluded.owner",
    [chat.id, chat.owner, chat.title, JSON.stringify(chat.messages), chat.pendingRunId, now, now],
  );
}

function fromRow(row: Record<string, unknown>): ArchivedChat {
  return {
    id: String(row.id),
    owner: String(row.owner),
    title: String(row.title),
    messages: row.messages ? JSON.parse(String(row.messages)) as ArchivedMessage[] : [],
    pendingRunId: row.pending_run_id ? String(row.pending_run_id) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getChat(id: string) {
  if (!configured()) return memory.get(id) ?? null;
  await ready();
  const rows = await query<Record<string, unknown>>("SELECT * FROM chat_archive WHERE id = ?", [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listChats(before?: { updatedAt: number; id: string }) {
  if (!configured()) {
    return [...memory.values()]
      .filter((chat) => !before || chat.updatedAt < before.updatedAt || (chat.updatedAt === before.updatedAt && chat.id < before.id))
      .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
      .slice(0, 51).map(({ messages: _messages, ...chat }) => chat);
  }
  await ready();
  const rows = await query<Record<string, unknown>>(
    before
      ? "SELECT id, owner, title, pending_run_id, created_at, updated_at FROM chat_archive WHERE updated_at < ? OR (updated_at = ? AND id < ?) ORDER BY updated_at DESC, id DESC LIMIT 51"
      : "SELECT id, owner, title, pending_run_id, created_at, updated_at FROM chat_archive ORDER BY updated_at DESC, id DESC LIMIT 51",
    before ? [before.updatedAt, before.updatedAt, before.id] : [],
  );
  return rows.map(({ messages: _messages, ...row }) => fromRow(row));
}
