import { getChat, listChats, saveChat } from "@/lib/chat-archive";
import { identity, isAdmin } from "@/lib/guest-session";
import { router } from "@/llm.config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "Not found" }, { status: 404 });
  const params = new URL(req.url).searchParams;
  try {
    const id = params.get("id");
    if (id) {
      if (!/^[\w-]{8,64}$/.test(id)) return Response.json({ error: "Invalid chat" }, { status: 400 });
      const chat = await getChat(id);
      if (!chat) return Response.json({ error: "Chat not found" }, { status: 404 });
      if (chat.pendingRunId) {
        const result = await router.result(chat.pendingRunId);
        if (result?.status === "done" && result.answer) {
          const last = chat.messages[chat.messages.length - 1];
          if (last?.role !== "assistant" || last.content !== result.answer) {
            chat.messages.push({ role: "assistant", content: result.answer });
          }
        }
      }
      return Response.json(chat, { headers: { "Cache-Control": "no-store" } });
    }
    const cursor = params.get("before");
    const [stamp, cursorId] = cursor?.split(":") ?? [];
    const before = stamp && cursorId && /^\d+$/.test(stamp) && /^[\w-]{8,64}$/.test(cursorId)
      ? { updatedAt: Number(stamp), id: cursorId }
      : undefined;
    const rows = await listChats(before);
    const chats = rows.slice(0, 50);
    const last = chats[chats.length - 1];
    return Response.json({ chats, nextCursor: rows.length > 50 && last ? `${last.updatedAt}:${last.id}` : null }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[chat-archive] read failed", error);
    return Response.json({ error: "Chat archive is unavailable." }, { status: 503 });
  }
}

/** Import this browser's older local chats after the owner signs in as admin. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; title?: unknown; messages?: unknown };
  if (typeof body.id !== "string" || !/^[\w-]{8,64}$/.test(body.id) || !Array.isArray(body.messages)) {
    return Response.json({ error: "Invalid chat" }, { status: 400 });
  }
  try {
    await saveChat({ id: body.id, owner: identity(req).owner, messages: body.messages, title: typeof body.title === "string" ? body.title : undefined, onlyIfAbsent: true });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[chat-archive] import failed", error);
    return Response.json({ error: "Chat archive is unavailable." }, { status: 503 });
  }
}
