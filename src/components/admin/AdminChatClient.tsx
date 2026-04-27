"use client";

import { useState, useEffect, useRef } from "react";

type Conversation = {
  id: string;
  sessionId: string;
  userName: string | null;
  userEmail: string | null;
  status: "OPEN" | "CLOSED";
  aiPaused: boolean;
  isTicket?: boolean;
  ticketStage?: string | null;
  ticketProblem?: string | null;
  ticketCreatedAt?: string | null;
  lastMessage: string | null;
  updatedAt: string;
  createdAt: string;
  user: { name: string | null; email: string | null } | null;
  _count: { messages: number };
};

type ChatMsg = {
  id: string;
  role: "USER" | "ASSISTANT" | "ADMIN";
  content: string;
  createdAt: string;
};

type ConversationDetail = {
  id: string;
  sessionId: string;
  status: "OPEN" | "CLOSED";
  aiPaused: boolean;
  isTicket?: boolean;
  ticketStage?: string | null;
  ticketProblem?: string | null;
  ticketCreatedAt?: string | null;
  user: { name: string | null; email: string | null } | null;
  userName: string | null;
  userEmail: string | null;
  messages: ChatMsg[];
  createdAt: string;
};

export function AdminChatClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [compareWith, setCompareWith] = useState<ConversationDetail | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [filter, setFilter] = useState<"all" | "OPEN" | "CLOSED" | "TICKETS">("all");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("You have a new reply from VoteToFeed Support 🐾");
  const [emailDraftBody, setEmailDraftBody] = useState("");
  const [emailDraftOpen, setEmailDraftOpen] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, [filter]);

  // Auto-refresh conversation list every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [selected?.messages]);

  async function loadConversations() {
    setLoadingList(true);
    try {
      let params = "";
      if (filter === "TICKETS") {
        params = "?ticket=true";
      } else if (filter !== "all") {
        params = `?status=${filter}`;
      }
      const res = await fetch(`/api/admin/chat${params}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }

  async function openConversation(id: string, forCompare = false) {
    if (!forCompare) setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/chat?conversationId=${id}`);
      const data = await res.json();
      const conv = data.conversation || null;
      if (forCompare) {
        setCompareWith(conv);
      } else {
        setSelected(conv);
        setReplyText("");
        setMobileShowDetail(true);
      }
    } catch {
      if (forCompare) setCompareWith(null);
      else setSelected(null);
    } finally {
      if (!forCompare) setLoadingDetail(false);
    }
  }

  async function toggleStatus(convId: string, newStatus: "OPEN" | "CLOSED") {
    await fetch("/api/admin/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId, status: newStatus }),
    });
    loadConversations();
    if (selected?.id === convId) {
      setSelected((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  }

  async function sendAdminReply(convId: string) {
    if (!replyText.trim() || sendingReply) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: replyText.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setReplyError(errData?.error || "Failed to send reply. Please try again.");
        return;
      }
      setReplyText("");
      // Reload the conversation to see the new message
      await openConversation(convId);
      loadConversations();
    } catch {
      setReplyError("Network error. Please check your connection and try again.");
    } finally {
      setSendingReply(false);
    }
  }

  async function sendEmailDraft(convId: string) {
    if (sendingEmail || !emailDraftBody.trim()) return;
    setSendingEmail(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          emailSubject: replySubject,
          emailBody: emailDraftBody,
          message: `📧 Email sent to user with subject: ${replySubject}`,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setReplyError(errData?.error || "Failed to send email. Please try again.");
        return;
      }
      setEmailDraftOpen(false);
      setEmailDraftBody("");
      await openConversation(convId);
      loadConversations();
    } catch {
      setReplyError("Network error. Please check your connection and try again.");
    } finally {
      setSendingEmail(false);
    }
  }

  async function toggleAiPause(convId: string, pause: boolean) {
    try {
      await fetch("/api/admin/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, aiPaused: pause }),
      });
      if (selected?.id === convId) {
        setSelected((prev) => prev ? { ...prev, aiPaused: pause } : null);
      }
      loadConversations();
    } catch {
      // silent fail
    }
  }

  async function generateReplyDraft(convId: string) {
    if (generatingDraft) return;
    setGeneratingDraft(true);
    try {
      const res = await fetch(`/api/admin/chat/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId }),
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data.subject) {
        setReplySubject(data.subject);
      }
      if (data.body) {
        setEmailDraftBody(data.body);
        setEmailDraftOpen(true);
      }
    } catch {
      // silent fail
    } finally {
      setGeneratingDraft(false);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderConversationPanel(conv: ConversationDetail, isCompare = false) {
    const needsHuman = conv.messages.some(
      (m) => m.role === "ASSISTANT" && m.content.includes("5-10 minutes")
    ) || conversations.find((c) => c.id === conv.id)?.lastMessage?.includes("⚡ NEEDS HUMAN SUPPORT")
      || conversations.find((c) => c.id === conv.id)?.lastMessage?.includes("⚡ Wants to open ticket");
    const ticketShort = conv.id.slice(-8).toUpperCase();

    return (
      <div className="flex-1 bg-white rounded-2xl border border-surface-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50 shrink-0">
          {!isCompare && (
            <button
              onClick={() => setMobileShowDetail(false)}
              className="md:hidden flex items-center gap-1 text-xs text-brand-500 font-semibold mb-2"
            >
              ← Back
            </button>
          )}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-sm text-surface-800 truncate">
                {conv.user?.name || conv.userName || "Anonymous Visitor"}
              </span>
              {(conv.userEmail || conv.user?.email) && (
                <span className="text-xs text-surface-500 truncate hidden sm:block">{conv.userEmail || conv.user?.email}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {conv.isTicket && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700" title={`Ticket #${ticketShort}`}>
                  🎫 Ticket #{ticketShort}
                </span>
              )}
              {!conv.isTicket && conv.ticketStage && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  📝 {conv.ticketStage === "AWAITING_PROBLEM" ? "Awaiting issue" : conv.ticketStage === "AWAITING_EMAIL" ? "Awaiting email" : conv.ticketStage}
                </span>
              )}
              {needsHuman && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
                  ⚡ Needs Help
                </span>
              )}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  conv.status === "OPEN"
                    ? "bg-green-100 text-green-700"
                    : "bg-surface-200 text-surface-500"
                }`}
              >
                {conv.status}
              </span>
            </div>
          </div>

          {/* AI Status + Actions row */}
          {!isCompare && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  conv.aiPaused
                    ? "bg-orange-100 text-orange-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${conv.aiPaused ? "bg-orange-500" : "bg-emerald-500"}`} />
                  {conv.aiPaused ? "AI Paused — You're handling" : "AI Active"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleAiPause(conv.id, !conv.aiPaused)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    conv.aiPaused
                      ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                      : "bg-orange-50 hover:bg-orange-100 text-orange-700"
                  }`}
                >
                  {conv.aiPaused ? "🤖 Resume AI" : "🙋 Take Over"}
                </button>
                <button
                  onClick={() =>
                    toggleStatus(conv.id, conv.status === "OPEN" ? "CLOSED" : "OPEN")
                  }
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-600 font-semibold transition-colors"
                >
                  {conv.status === "OPEN" ? "✕ Close Case" : "↻ Reopen"}
                </button>
              </div>
            </div>
          )}
          {isCompare && (
            <div className="flex justify-end">
              <button
                onClick={() => { setCompareWith(null); setCompareMode(false); }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold transition-colors"
              >
                ✕ Close Compare
              </button>
            </div>
          )}

          {conv.ticketProblem && (
            <div className="mb-3 px-4 py-3 bg-purple-50 border border-purple-100 rounded-2xl text-sm text-surface-800">
              <div className="font-semibold text-surface-800 mb-1">Ticket issue:</div>
              <div className="text-sm">{conv.ticketProblem}</div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={!isCompare ? messagesContainerRef : undefined} className="flex-1 overflow-y-auto px-5 py-2 space-y-1">
          {conv.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[80%]">
                {msg.role === "ADMIN" && (
                  <div className="text-[9px] text-blue-600 font-bold mb-px ml-1">Admin</div>
                )}
                {msg.role === "ASSISTANT" && (
                  <div className="text-[9px] text-surface-400 font-medium mb-px ml-1">AI</div>
                )}
                <div
                  className={`rounded-2xl px-3 py-1.5 text-[13px] leading-snug whitespace-pre-wrap ${
                    msg.role === "USER"
                      ? "bg-brand-500 text-white rounded-br-md"
                      : msg.role === "ADMIN"
                      ? "bg-blue-50 text-surface-800 rounded-bl-md border border-blue-200"
                      : "bg-surface-100 text-surface-800 rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
                <div
                  className={`text-[9px] text-surface-300 mt-px ${
                    msg.role === "USER" ? "text-right" : "text-left"
                  }`}
                >
                  {formatDate(msg.createdAt)}
                </div>
              </div>
            </div>
          ))}
          <div ref={!isCompare ? messagesEndRef : undefined} />
        </div>

        {/* Admin Reply Input (only for primary panel) */}
        {!isCompare && (
          <div className="border-t border-surface-200 px-4 py-3 bg-surface-50 shrink-0">
            {conv.aiPaused && (
              <div className="mb-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-[11px] text-orange-700 font-semibold">🙋 AI is paused — the user won&apos;t get AI replies until you close this case or resume AI.</p>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendAdminReply(conv.id);
                  }
                }}
                placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
              <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => sendAdminReply(conv.id)}
                disabled={sendingReply || !replyText.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendingReply ? "..." : "Send"}
              </button>
              <button
                onClick={() => generateReplyDraft(conv.id)}
                disabled={generatingDraft}
                className="px-4 py-2 rounded-xl bg-surface-100 text-surface-800 text-sm font-semibold hover:bg-surface-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generatingDraft ? "Generating..." : "Generate Email"}
              </button>
              <button
                onClick={() => sendEmailDraft(conv.id)}
                disabled={sendingEmail || !emailDraftBody.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendingEmail ? "Sending..." : "Send Email"}
              </button>
            </div>
            {emailDraftOpen && (
              <div className="mt-2 px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-[11px] font-semibold text-purple-700 flex items-center justify-between">
                <span>✉️ Email draft is open in editor →</span>
                <button onClick={() => setEmailDraftOpen(false)} className="text-purple-600 hover:text-purple-800 underline">close draft</button>
              </div>
            )}
          </div>
            <p className="text-[10px] text-surface-400 mt-1">Reply sent to user&apos;s chat + notified via email</p>
            {replyError && (
              <p className="text-[11px] text-red-600 mt-1 font-medium">{replyError}</p>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="px-5 py-2 border-t border-surface-200 bg-surface-50 shrink-0">
          <p className="text-[11px] text-surface-400">
            Session: {conv.sessionId.slice(0, 8)}... •{" "}
            Started {formatDate(conv.createdAt)} •{" "}
            {conv.messages.length} messages
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-190px)] sm:h-[calc(100dvh-210px)] md:h-[calc(100vh-230px)]">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {[
          {
            label: "Total",
            value: conversations.length,
            color: "bg-surface-100 text-surface-700",
          },
          {
            label: "Open",
            value: conversations.filter((c) => c.status === "OPEN").length,
            color: "bg-green-50 text-green-700",
          },
          {
            label: "Needs Help",
            value: conversations.filter((c) => c.lastMessage?.includes("⚡ NEEDS HUMAN SUPPORT")).length,
            color: "bg-red-50 text-red-700",
          },
          {
            label: "Tickets",
            value: conversations.filter((c) => c.isTicket).length,
            color: "bg-purple-50 text-purple-700",
          },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => {
              if (s.label === "Tickets") setFilter("TICKETS");
              else if (s.label === "Open") setFilter("OPEN");
              else if (s.label === "Total") setFilter("all");
              else if (s.label === "Needs Help") setFilter("OPEN");
            }}
            className={`cursor-pointer rounded-xl px-3 py-2.5 md:px-4 md:py-3 ${s.color} text-left transition-all ${
              s.label === "Tickets" && filter === "TICKETS"
                ? "ring-2 ring-purple-500 shadow-md"
                : (s.label === "Open" && filter === "OPEN") ||
                  (s.label === "Total" && filter === "all")
                ? "ring-2 ring-brand-500"
                : "hover:ring-2 hover:ring-surface-300 hover:shadow-sm"
            }`}
          >
            <div className="text-xl md:text-2xl font-black">{s.value}</div>
            <div className="text-[11px] font-semibold opacity-80 flex items-center gap-1">
              {s.label}
              {s.label === "Tickets" && <span className="text-[9px] opacity-60">→</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Conversations List */}
        <div className={`${mobileShowDetail ? "hidden" : "flex"} md:flex w-full md:w-72 lg:w-80 shrink-0 flex-col overflow-hidden`}>
          <div className="flex gap-1 mb-4">
            {(["all", "OPEN", "CLOSED", "TICKETS"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filter === f
                    ? "bg-brand-500 text-white"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                }`}
              >
                {f === "all" ? "All" : f === "OPEN" ? "Open" : f === "CLOSED" ? "Closed" : "Tickets"}
              </button>
            ))}
            <button
              onClick={() => loadConversations()}
              className="ml-1 px-2 py-1.5 text-xs font-semibold rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors"
              title="Refresh"
            >
              ↻
            </button>
            <button
              onClick={() => {
                setCompareMode(!compareMode);
                if (compareMode) setCompareWith(null);
              }}
              className={`ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                compareMode
                  ? "bg-purple-500 text-white"
                  : "bg-surface-100 text-surface-600 hover:bg-surface-200"
              }`}
            >
              {compareMode ? "✕ Compare" : "⇔ Compare"}
            </button>
          </div>

          {loadingList ? (
            <div className="text-sm text-surface-500 py-8 text-center">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="text-sm text-surface-500 py-8 text-center">No conversations yet</div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto">
              {/* Sort: needs-human first, then open, then closed */}
              {[...conversations]
                .sort((a, b) => {
                  const aPriority = a.lastMessage?.includes("⚡ NEEDS HUMAN SUPPORT") ? 0 : a.status === "OPEN" ? 1 : 2;
                  const bPriority = b.lastMessage?.includes("⚡ NEEDS HUMAN SUPPORT") ? 0 : b.status === "OPEN" ? 1 : 2;
                  if (aPriority !== bPriority) return aPriority - bPriority;
                  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                })
                .map((c) => {
                  const needsHelp = c.lastMessage?.includes("⚡ NEEDS HUMAN SUPPORT");
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (compareMode && selected && selected.id !== c.id) {
                          openConversation(c.id, true);
                        } else {
                          openConversation(c.id);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selected?.id === c.id
                          ? "border-brand-400 bg-brand-50 shadow-sm"
                          : compareWith?.id === c.id
                          ? "border-purple-400 bg-purple-50 shadow-sm"
                          : needsHelp
                          ? "border-red-300 bg-red-50 hover:border-red-400 hover:shadow-sm"
                          : "border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-surface-800 truncate max-w-[140px]">
                          {c.user?.name || c.userName || c.user?.email || "Visitor"}
                        </span>
                        <div className="flex items-center gap-1">
                          {needsHelp && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">⚡</span>
                          )}
                          {c.aiPaused && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">🙋</span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              c.status === "OPEN"
                                ? "bg-green-100 text-green-700"
                                : "bg-surface-200 text-surface-500"
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-surface-500 truncate">
                        {c.ticketProblem
                          ? `🎫 ${c.ticketProblem}`
                          : c.lastMessage?.replace("[⚡ NEEDS HUMAN SUPPORT] ", "") || "No messages"}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-surface-400">{formatDate(c.updatedAt)}</span>
                        <span className="text-[10px] text-surface-400">{c._count.messages} msgs</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

      {/* Conversation Detail / Compare */}
      {!selected && !loadingDetail ? (
        <div className={`${mobileShowDetail ? "flex" : "hidden"} md:flex flex-1 bg-white rounded-2xl border border-surface-200 items-center justify-center text-surface-400 text-sm`}>
          Select a conversation to view
        </div>
      ) : loadingDetail ? (
        <div className={`${mobileShowDetail ? "flex" : "hidden"} md:flex flex-1 bg-white rounded-2xl border border-surface-200 items-center justify-center text-surface-400 text-sm`}>
          Loading...
        </div>
      ) : selected ? (
        <div className={`${mobileShowDetail ? "flex" : "hidden"} md:flex gap-4 flex-1`}>
          {renderConversationPanel(selected)}
          {compareWith && renderConversationPanel(compareWith, true)}
        </div>
      ) : null}
      </div>

      {/* ─── EMAIL DRAFT MODAL ─── */}
      {emailDraftOpen && selected && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEmailDraftOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-surface-200 bg-purple-50 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">✉️</span>
                  <h2 className="text-lg font-bold text-surface-900">Email draft</h2>
                </div>
                <p className="text-[11px] text-surface-500 mt-0.5">
                  Sending from <strong>support@votetofeed.com</strong> to <strong>{selected.userEmail || selected.user?.email || "(no email on file)"}</strong> via Resend
                </p>
              </div>
              <button
                onClick={() => setEmailDraftOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-surface-100 text-surface-700 text-sm font-semibold border border-surface-200"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal body — split edit / preview */}
            <div className="flex-1 overflow-hidden grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-surface-200">
              {/* EDIT */}
              <div className="p-5 overflow-y-auto">
                <label className="block text-xs font-semibold text-surface-600 mb-1">Subject</label>
                <input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  className="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <label className="block text-xs font-semibold text-surface-600 mb-1 mt-4">Body</label>
                <textarea
                  value={emailDraftBody}
                  onChange={(e) => setEmailDraftBody(e.target.value)}
                  rows={16}
                  className="w-full resize-none rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => generateReplyDraft(selected.id)}
                    disabled={generatingDraft}
                    className="px-3 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-semibold disabled:opacity-50"
                  >
                    {generatingDraft ? "Generating…" : "🔁 Regenerate with AI"}
                  </button>
                </div>
              </div>

              {/* PREVIEW */}
              <div className="p-5 bg-surface-50 overflow-y-auto">
                <div className="text-xs font-semibold text-surface-600 mb-2">Preview (what the customer sees)</div>
                <div className="rounded-xl border border-surface-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-4 bg-gradient-to-r from-red-600 to-red-500 text-white text-center">
                    <div className="text-xl font-black tracking-tight">🐾 VoteToFeed</div>
                    <div className="text-[11px] opacity-80 uppercase tracking-wider mt-1">Every vote feeds a shelter pet</div>
                  </div>
                  <div className="px-5 py-3 bg-surface-50 border-b border-surface-200 text-[12px] text-surface-500 space-y-0.5">
                    <div><span className="font-semibold text-surface-600">From:</span> VoteToFeed Support &lt;support@votetofeed.com&gt;</div>
                    <div><span className="font-semibold text-surface-600">To:</span> {selected.userEmail || selected.user?.email || "(no email)"}</div>
                    <div><span className="font-semibold text-surface-600">Subject:</span> <span className="text-surface-800 font-semibold">{replySubject || "(no subject)"}</span></div>
                  </div>
                  <div className="px-5 py-5 text-[14px] text-surface-800 leading-relaxed">
                    <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2">💬 New Support Reply</div>
                    <div className="text-lg font-black text-surface-900 mb-3">Hello!</div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 whitespace-pre-wrap text-[14px] leading-relaxed">
                      {emailDraftBody || <span className="text-surface-400 italic">Body is empty…</span>}
                    </div>
                    <p className="mt-4 text-[13px] text-surface-600">Just reply to this email and we&apos;ll see your message right in your support thread.</p>
                  </div>
                  <div className="px-5 py-3 border-t border-surface-200 bg-surface-50 text-center text-[11px] text-surface-400">
                    VoteToFeed · Privacy · Terms
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-3 border-t border-surface-200 bg-white flex items-center justify-between shrink-0">
              <p className="text-[11px] text-surface-500">
                {selected.userEmail || selected.user?.email
                  ? "Customer can reply to this email and it will appear back in this thread."
                  : "⚠️ This conversation has no email on file — sending will fail."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEmailDraftOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => sendEmailDraft(selected.id)}
                  disabled={sendingEmail || !emailDraftBody.trim() || !(selected.userEmail || selected.user?.email)}
                  className="px-5 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingEmail ? "Sending…" : "📨 Send via Resend"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
