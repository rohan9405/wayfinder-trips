"use client";

import { Renderer } from "@openuidev/react-lang";
import { LockKeyhole, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { localChatsForArchive, TURN_COMPLETE_EVENT } from "@/lib/chat-storage";
import { library } from "@/library";

type Session = { role: "guest" | "admin"; guestLabel: string; adminAvailable: boolean };
type ChatSummary = { id: string; owner: string; title: string; updatedAt: number };
type Chat = ChatSummary & { messages: { role: "user" | "assistant"; content: string }[] };

function displayContent(raw: string) {
  const marker = raw.lastIndexOf("]]>openui:content");
  if (marker < 0) return raw.replace(/\n?\]\]>openui:end[\s\S]*$/, "");
  const start = raw.indexOf("\n", marker);
  if (start < 0) return "";
  const context = raw.indexOf("]]>openui:context", start);
  const end = raw.indexOf("]]>openui:end", start);
  const stop = [context, end].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? raw.length;
  return raw.slice(start + 1, stop).trimEnd();
}

export function AdminChats() {
  const [session, setSession] = useState<Session | null>(null);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Chat | null>(null);

  const load = useCallback(async (cursor?: string) => {
    const response = await fetch(`/api/chats${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    const body = await response.json() as { chats?: ChatSummary[]; nextCursor?: string | null; error?: string };
    if (!response.ok) throw new Error(body.error || "Could not load chats.");
    setChats((previous) => cursor ? [...previous, ...(body.chats ?? [])] : body.chats ?? []);
    setNextCursor(body.nextCursor ?? null);
  }, []);

  useEffect(() => {
    void fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json() as Promise<Session>)
      .then(setSession)
      .catch(() => setError("Could not check your session."));
  }, []);

  useEffect(() => {
    if (session?.role !== "admin") return;
    let cancelled = false;
    void (async () => {
      // Import only this browser's older local chats. Existing server records win.
      await Promise.all(localChatsForArchive().map(async (chat) => {
        try {
          await fetch("/api/chats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chat),
          });
        } catch {
          /* Archive loading below reports an unavailable store. */
        }
      }));
      if (!cancelled) await load().catch((cause: Error) => setError(cause.message));
    })();
    const onTurn = () => { void load().catch((cause: Error) => setError(cause.message)); };
    window.addEventListener(TURN_COMPLETE_EVENT, onTurn);
    return () => {
      cancelled = true;
      window.removeEventListener(TURN_COMPLETE_EVENT, onTurn);
    };
  }, [session?.role, load]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(body.error || "Sign-in failed.");
      setPassword("");
      setSession(body);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    const response = await fetch("/api/session", { method: "DELETE" });
    if (!response.ok) return setError("Could not sign out.");
    setSession(await response.json() as Session);
    setChats([]);
    setSelected(null);
    setError("");
  }

  async function openChat(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/chats?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json() as Chat & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not open chat.");
      setSelected(body);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  if (!session) return null;
  return (
    <div className="wf-identity">
      {session.role === "guest" ? (
        <>
          <div className="wf-identity__label">{session.guestLabel}</div>
          {session.adminAvailable ? (
            <details className="wf-admin-login">
              <summary><LockKeyhole size={13} /> Admin sign in</summary>
              <form onSubmit={signIn}>
                <input type="password" aria-label="Admin password" autoComplete="current-password" placeholder="Admin password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button type="submit" disabled={signingIn}>{signingIn ? "Signing in…" : "Sign in"}</button>
              </form>
            </details>
          ) : null}
        </>
      ) : (
        <>
          <div className="wf-identity__heading"><span>All chats · read only</span><button type="button" onClick={signOut}>Sign out</button></div>
          <div className="wf-archive-list">
            {chats.map((chat) => (
              <button type="button" key={chat.id} onClick={() => void openChat(chat.id)}>
                <span className="wf-archive-list__title">{chat.title}</span>
                <span className="wf-archive-list__meta">{chat.owner === "admin" ? "You" : chat.owner.replace("guest:", "Guest ").slice(0, 14).toUpperCase()} · {new Date(chat.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
            {chats.length === 0 && !error ? <span className="wf-identity__label">No archived chats yet.</span> : null}
            {nextCursor ? <button type="button" className="wf-archive-more" onClick={() => void load(nextCursor).catch((cause: Error) => setError(cause.message))}>Load more</button> : null}
          </div>
        </>
      )}
      {error ? <div className="wf-identity__error" role="alert">{error}</div> : null}
      {selected && createPortal(
        <div className="wf-chat-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="wf-chat-reader" role="dialog" aria-modal="true" aria-label={`Read-only chat: ${selected.title}`}>
            <header className="wf-chat-reader__header">
              <div><strong>{selected.title}</strong><span>{selected.owner === "admin" ? "You" : selected.owner.replace("guest:", "Guest ").slice(0, 14).toUpperCase()} · Read only</span></div>
              <button type="button" aria-label="Close chat" onClick={() => setSelected(null)}><X size={18} /></button>
            </header>
            <div className="wf-chat-reader__messages">
              {selected.messages.map((message, index) => {
                const content = displayContent(message.content);
                return <div key={index} className={`wf-chat-reader__message wf-chat-reader__message--${message.role}`}>
                  <div className="wf-chat-reader__role">{message.role === "user" ? "User" : "Wayfinder"}</div>
                  {message.role === "assistant" && /(^|\n)\s*root\s*=/.test(content)
                    ? <div inert><Renderer response={content} library={library} isStreaming onAction={() => {}} /></div>
                    : <div className="wf-chat-reader__plain">{content}</div>}
                </div>;
              })}
            </div>
          </section>
        </div>, document.body,
      )}
    </div>
  );
}
