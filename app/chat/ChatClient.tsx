"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's the new-member onboarding process?",
  "Where does the club allow rifle shooting and what are the hours?",
  "When is the next general meeting?",
  "What's the dress code or eye/ear protection requirement?",
  "How do I order ammo through the club?",
];

export default function ChatClient({ ready }: { ready: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  async function ask(question: string) {
    if (!question.trim() || streaming) return;
    setError(null);
    const history = messages;
    setMessages([...history, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, question }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const lines = evt.split("\n");
          let event = "message", data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          let payload: unknown;
          try { payload = JSON.parse(data); } catch { continue; }
          if (event === "token" && typeof payload === "string") {
            assistantText += payload;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: assistantText };
              return copy;
            });
          } else if (event === "error" && typeof payload === "string") {
            throw new Error(payload);
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
      // Drop the empty assistant placeholder if streaming never produced text.
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: "60vh" }}>
      {!ready ? (
        <div className="rounded-xl border bg-amber-50 text-amber-900 p-4 text-sm">
          You need to upload the handbook PDF and at least one newsletter on{" "}
          <a className="underline" href="/admin">/admin</a> before the copilot can answer questions.
        </div>
      ) : null}

      <div className="flex-1 space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 sm:p-5">
            <p className="text-sm text-slate-500 mb-3">Try asking:</p>
            <ul className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    disabled={!ready || streaming}
                    className="text-left text-sm w-full px-3 py-2 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m, i) => (
            <article
              key={i}
              className={
                m.role === "user"
                  ? "rounded-2xl bg-slate-900 text-white p-3 sm:p-4 ml-auto max-w-[88%]"
                  : "rounded-2xl border bg-white p-3 sm:p-4 mr-auto max-w-[92%]"
              }
            >
              {m.content === "" ? (
                <span className="inline-flex gap-1 items-center text-slate-500 text-sm">
                  <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                </span>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              )}
            </article>
          ))
        )}
        {error ? (
          <div className="rounded-xl border bg-rose-50 text-rose-900 p-3 text-sm">{error}</div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-2 mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            disabled={!ready || streaming}
            rows={1}
            placeholder={ready ? "Ask about a rule, schedule, or contact…" : "Upload docs first"}
            className="flex-1 resize-none px-3 py-2 text-sm focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 max-h-40"
            style={{ minHeight: 36 }}
          />
          <button
            type="submit"
            disabled={!ready || streaming || !input.trim()}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => { setMessages([]); setError(null); }}
            disabled={streaming}
            className="mt-2 text-xs text-slate-500 hover:text-slate-700"
          >
            Clear conversation
          </button>
        ) : null}
      </form>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}
