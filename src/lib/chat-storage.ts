"use client";

import { agUIAdapter } from "@openuidev/react-headless";
import type { ChatLLM, ChatStorage, Message, Thread, UserMessage } from "@openuidev/react-headless";

/**
 * Chats saved in this browser (localStorage), keeping the MAX_THREADS most recently used, plus
 * the LLM connection that keeps them complete:
 *
 * - Each request carries a `runId`. The server finishes the turn even if the browser leaves
 *   and stores the answer under that id.
 * - Before sending, the thread is saved with a "pending" marker. When the reply streams in
 *   fully, it's saved and the marker cleared.
 * - If the user switched chats (which cancels the request), the marker stays. Opening that
 *   chat again waits for the stored answer and adds it.
 */

const MAX_THREADS = 5;
const THREADS_KEY = "wayfinder.threads.v1";
const messagesKey = (id: string) => `wayfinder.messages.v1.${id}`;
const pendingKey = (id: string) => `wayfinder.pending.v1.${id}`;
const PENDING_MAX_AGE_MS = 10 * 60_000;
const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 4 * 60_000;

/** Fired on window when a turn's answer is complete (used to refresh the quota badge). */
export const TURN_COMPLETE_EVENT = "wayfinder:turn-complete";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the chat still works, it just isn't saved.
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const listThreads = () => read<Thread[]>(THREADS_KEY, []);

/** Existing local chats can be copied once into the admin's read-only archive. */
export function localChatsForArchive() {
  return listThreads().map((thread) => ({
    id: thread.id,
    title: thread.title,
    messages: read<Message[]>(messagesKey(thread.id), []),
  }));
}

/** Save threads newest-first, dropping (and deleting the data of) anything past the cap. */
function saveThreads(threads: Thread[]) {
  const keep = threads.slice(0, MAX_THREADS);
  for (const dropped of threads.slice(MAX_THREADS)) {
    remove(messagesKey(dropped.id));
    remove(pendingKey(dropped.id));
  }
  write(THREADS_KEY, keep);
}

/** Move a thread to the front so the cap removes the least recently used chat. */
function touch(threadId: string) {
  const threads = listThreads();
  const thread = threads.find((t) => t.id === threadId);
  if (thread) saveThreads([thread, ...threads.filter((t) => t.id !== threadId)]);
}

function titleFrom(message: UserMessage) {
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ");
  return text.trim().slice(0, 60) || "New chat";
}

function appendReply(threadId: string, content: string, fallback: Message[] = []) {
  const saved = read<Message[]>(messagesKey(threadId), fallback);
  write(messagesKey(threadId), [...saved, { id: crypto.randomUUID(), role: "assistant", content }]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for the server to finish a turn the browser stopped listening to. */
async function awaitStoredReply(url: string, runId: string): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}?id=${encodeURIComponent(runId)}`, { cache: "no-store" });
      const body = (await res.json()) as { status?: string; answer?: string };
      if (body.status === "done" && body.answer) return body.answer;
      if (body.status === "unknown") return null;
    } catch {
      /* network blip: keep waiting */
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

export function createLocalChatStorage(chatUrl: string): ChatStorage {
  return {
    thread: {
      async listThreads() {
        return { threads: listThreads() };
      },
      async createThread(firstMessage: UserMessage) {
        const thread: Thread = {
          id: crypto.randomUUID(),
          title: titleFrom(firstMessage),
          createdAt: new Date().toISOString(),
        };
        write(messagesKey(thread.id), [{ ...firstMessage, id: firstMessage.id ?? crypto.randomUUID() }]);
        saveThreads([thread, ...listThreads()]);
        return thread;
      },
      async getMessages(threadId: string) {
        const pending = read<{ runId: string; at: number } | null>(pendingKey(threadId), null);
        if (pending) {
          if (Date.now() - pending.at < PENDING_MAX_AGE_MS) {
            // The chat shows its loading state until the stored answer arrives.
            const answer = await awaitStoredReply(chatUrl, pending.runId);
            // Another tab (or the original stream) may have saved it meanwhile.
            if (answer && read(pendingKey(threadId), null)) appendReply(threadId, answer);
            if (answer) window.dispatchEvent(new Event(TURN_COMPLETE_EVENT));
          }
          remove(pendingKey(threadId));
        }
        return read<Message[]>(messagesKey(threadId), []);
      },
      async updateThread(thread: Thread) {
        saveThreads(listThreads().map((t) => (t.id === thread.id ? { ...t, ...thread } : t)));
        return thread;
      },
      async deleteThread(id: string) {
        remove(messagesKey(id));
        remove(pendingKey(id));
        saveThreads(listThreads().filter((t) => t.id !== id));
      },
    },
  };
}

/** The AG-UI connection to the chat route, saving each turn locally as described above. */
export function createPersistentChatLLM(url: string): ChatLLM {
  return {
    streamProtocol: agUIAdapter(),
    async send({ threadId, messages, signal }) {
      const runId = crypto.randomUUID();
      const known = listThreads().some((t) => t.id === threadId);
      if (known) {
        write(messagesKey(threadId), messages);
        write(pendingKey(threadId), { runId, at: Date.now() });
        touch(threadId);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, runId, messages, tools: [], context: [] }),
        signal,
      });
      if (!known || !response.body) return response;

      // Read a copy of the stream to save the reply; the other copy goes to the UI.
      const [forUi, forSave] = response.body.tee();
      void collectReply(forSave).then(({ text, finished }) => {
        if (!finished || !text) return; // cancelled: the pending marker stays for later
        if (read(pendingKey(threadId), null)) {
          appendReply(threadId, text, messages);
          remove(pendingKey(threadId));
        }
        window.dispatchEvent(new Event(TURN_COMPLETE_EVENT));
      });
      return new Response(forUi, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  };
}

/** Concatenate the TEXT_MESSAGE_CONTENT deltas of an AG-UI SSE stream. */
async function collectReply(body: ReadableStream<Uint8Array>): Promise<{ text: string; finished: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") text += event.delta;
          if (event.type === "RUN_FINISHED") finished = true;
        } catch {
          /* partial or non-JSON line */
        }
      }
    }
  } catch {
    // Stream cancelled (user switched chats or pressed stop).
  }
  return { text, finished };
}
