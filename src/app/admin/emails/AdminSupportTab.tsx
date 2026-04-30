"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SupportConvSummary = {
  id: string;
  ticketShort: string;
  userName: string | null;
  userEmail: string | null;
  status: "OPEN" | "CLOSED";
  isTicket: boolean;
  ticketStage: string | null;
  ticketProblem: string | null;
  ticketCreatedAt: string | null;
  aiPaused: boolean;
  lastMessage: string | null;
  updatedAt: string;
  sentCount: number;
  receivedCount: number;
  lastEmailAt: string | null;
  lastSentAt: string | null;
  lastReceivedAt: string | null;
  hasUnansweredReply: boolean;
  totalMessages: number;
};

type SupportMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "ADMIN";
  content: string;
  createdAt: string;
  kind: "chat" | "email_sent" | "email_received";
};

type SupportConvDetail = {
  id: string;
  ticketShort: string;
  userName: string | null;
  userEmail: string | null;
  status: "OPEN" | "CLOSED";
  isTicket: boolean;
  ticketStage: string | null;
  ticketProblem: string | null;
  ticketCreatedAt: string | null;
  aiPaused: boolean;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
};

type Totals = {
  tickets: number;
  openTickets: number;
  sent: number;
  received: number;
  awaitingReply: number;
};

type Filter = "all" | "tickets" | "open" | "with_email" | "awaiting";

function timeAgo(d: string | null) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function AdminSupportTab() {
  const [list, setList] = useState<SupportConvSummary[]>([]);
  const [totals, setTotals] = useState<Totals>({ tickets: 0, openTickets: 0, sent: 0, received: 0, awaitingReply: 0 });
  const [filter, setFilter] = useState<Filter>("tickets");
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportConvDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftIsFallback, setDraftIsFallback] = useState(false);
  const [draftFallbackReason, setDraftFallbackReason] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  // Manual paste of customer reply
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteFrom, setPasteFrom] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [pasting, setPasting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/emails/support");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setList(json.conversations || []);
      setTotals(json.totals || { tickets: 0, openTickets: 0, sent: 0, received: 0, awaitingReply: 0 });
    } catch {
      setList([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/emails/support?conversationId=${id}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setDetail(json.conversation);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Auto-refresh both list and selected detail every 15s so inbound emails appear without a manual refresh
  useEffect(() => {
    const t = setInterval(() => {
      fetchList();
      if (selectedId) fetchDetail(selectedId);
    }, 15000);
    return () => clearInterval(t);
  }, [fetchList, fetchDetail, selectedId]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  const filtered = list.filter((c) => {
    if (filter === "tickets") return c.isTicket;
    if (filter === "open") return c.status === "OPEN";
    if (filter === "with_email") return !!c.userEmail;
    if (filter === "awaiting") return c.hasUnansweredReply;
    return true;
  });

  // Sort: awaiting reply first, then by latest activity
  const sorted = [...filtered].sort((a, b) => {
    if (a.hasUnansweredReply !== b.hasUnansweredReply) return a.hasUnansweredReply ? -1 : 1;
    const aDate = a.lastEmailAt || a.updatedAt;
    const bDate = b.lastEmailAt || b.updatedAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  async function generateDraft() {
    if (!detail || generating) return;
    setGenerating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/chat/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: detail.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (!json.subject && !json.body)) {
        setFeedback(json.error || "AI generation failed — try again or write the reply manually.");
        // Still open an empty draft so the admin can write something by hand
        setDraftSubject(`Re: Ticket #${detail.ticketShort}`);
        setDraftBody("");
        setDraftOpen(true);
        return;
      }
      setDraftSubject(json.subject || `Re: Ticket #${detail.ticketShort}`);
      setDraftBody(json.body || "");
      setDraftIsFallback(!!json.fallback);
      setDraftFallbackReason(json.fallbackReason || null);
      setDraftOpen(true);
      if (json.fallback) {
        setFeedback(`AI unavailable — showing a starter draft. See details inside the modal.`);
      } else {
        setDraftFallbackReason(null);
        setFeedback("AI draft ready — review and edit before sending.");
      }
      setTimeout(() => {
        draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch {
      setFeedback("Generation failed — check your connection.");
      setDraftSubject(`Re: Ticket #${detail.ticketShort}`);
      setDraftBody("");
      setDraftOpen(true);
    } finally {
      setGenerating(false);
    }
  }

  async function sendDraft() {
    if (!detail || sending || !draftBody.trim()) return;
    if (!detail.userEmail) {
      setFeedback("This ticket has no customer email — can't send.");
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: detail.id,
          emailSubject: draftSubject,
          emailBody: draftBody,
          message: `📧 Email sent to user with subject: ${draftSubject}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFeedback(err.error || "Send failed");
        return;
      }
      setFeedback("Email sent via Resend ✅");
      setDraftOpen(false);
      setDraftBody("");
      setDraftSubject("");
      await fetchDetail(detail.id);
      await fetchList();
    } catch {
      setFeedback("Send failed");
    } finally {
      setSending(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  function openPasteModal() {
    if (!detail) return;
    setPasteFrom(detail.userEmail || "");
    setPasteSubject(`Re: Ticket #${detail.ticketShort}`);
    setPasteBody("");
    setPasteOpen(true);
  }

  async function savePastedReply() {
    if (!detail || pasting || !pasteBody.trim()) return;
    setPasting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/emails/manual-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: detail.id,
          subject: pasteSubject.trim(),
          body: pasteBody.trim(),
          fromEmail: pasteFrom.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFeedback(err.error || "Failed to save reply");
        return;
      }
      setPasteOpen(false);
      setPasteBody("");
      setFeedback("📥 Customer reply added to thread");
      await fetchDetail(detail.id);
      await fetchList();
    } catch {
      setFeedback("Failed to save reply");
    } finally {
      setPasting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  async function toggleStatus(newStatus: "OPEN" | "CLOSED") {
    if (!detail) return;
    await fetch("/api/admin/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: detail.id, status: newStatus }),
    });
    await fetchDetail(detail.id);
    await fetchList();
  }

  return (
    <div className="space-y-4">
      {/* Stat cards specific to support */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => setFilter("tickets")}
          className={`rounded-xl bg-purple-50 text-purple-700 px-4 py-3 text-left transition ${filter === "tickets" ? "ring-2 ring-purple-500" : "hover:ring-1 hover:ring-purple-300"}`}
        >
          <div className="text-2xl font-black">{totals.tickets}</div>
          <div className="text-[11px] font-semibold opacity-80">Total Tickets</div>
        </button>
        <button
          onClick={() => setFilter("open")}
          className={`rounded-xl bg-green-50 text-green-700 px-4 py-3 text-left transition ${filter === "open" ? "ring-2 ring-green-500" : "hover:ring-1 hover:ring-green-300"}`}
        >
          <div className="text-2xl font-black">{totals.openTickets}</div>
          <div className="text-[11px] font-semibold opacity-80">Open Tickets</div>
        </button>
        <button
          onClick={() => setFilter("awaiting")}
          className={`rounded-xl bg-amber-100 text-amber-800 px-4 py-3 text-left transition ${filter === "awaiting" ? "ring-2 ring-amber-500" : "hover:ring-1 hover:ring-amber-400"} ${totals.awaitingReply > 0 ? "animate-pulse" : ""}`}
        >
          <div className="text-2xl font-black">{totals.awaitingReply}</div>
          <div className="text-[11px] font-semibold opacity-80">📥 Awaiting Reply</div>
        </button>
        <div className="rounded-xl bg-blue-50 text-blue-700 px-4 py-3">
          <div className="text-2xl font-black">{totals.sent}</div>
          <div className="text-[11px] font-semibold opacity-80">Emails Sent</div>
        </div>
        <div className="rounded-xl bg-amber-50 text-amber-700 px-4 py-3">
          <div className="text-2xl font-black">{totals.received}</div>
          <div className="text-[11px] font-semibold opacity-80">Emails Received</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* LEFT: list */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden flex flex-col max-h-[700px]">
          <div className="px-3 py-2 border-b border-surface-100 bg-surface-50 flex flex-wrap gap-1">
            {(["tickets", "open", "awaiting", "with_email", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  filter === f ? "bg-purple-500 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                }`}
              >
                {f === "tickets" ? "🎫 Tickets" : f === "open" ? "Open" : f === "awaiting" ? "📥 Awaiting" : f === "with_email" ? "📧 With Email" : "All"}
              </button>
            ))}
            <button
              onClick={fetchList}
              className="ml-auto px-2 py-1 rounded-md text-[11px] font-semibold bg-surface-100 text-surface-600 hover:bg-surface-200"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {loadingList && list.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-surface-400">Loading…</div>
            ) : sorted.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-surface-400">No conversations match this filter.</div>
            ) : (
              sorted.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b transition-colors ${
                    selectedId === c.id
                      ? "bg-purple-50 border-purple-200"
                      : c.hasUnansweredReply
                      ? "bg-amber-50/40 border-amber-100 hover:bg-amber-50"
                      : "border-surface-100 hover:bg-surface-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {c.isTicket && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          🎫 #{c.ticketShort}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-surface-800 truncate">
                        {c.userName || c.userEmail || "Visitor"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.hasUnansweredReply && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                          📥 NEW
                        </span>
                      )}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        c.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-surface-200 text-surface-500"
                      }`}>{c.status}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-surface-500 truncate">
                    {c.ticketProblem || c.lastMessage || "No messages"}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-surface-400 mt-1">
                    <span className="text-blue-500">📤 {c.sentCount}</span>
                    <span className="text-amber-500">📥 {c.receivedCount}</span>
                    <span className="ml-auto">{timeAgo(c.lastEmailAt || c.updatedAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: detail + draft */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-sm flex flex-col max-h-[700px]">
          {!detail && !loadingDetail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-surface-400 p-8">
              Select a conversation to view its email thread.
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-surface-400 p-8">Loading…</div>
          ) : detail ? (
            <>
              <div className="px-4 py-3 border-b border-surface-200 bg-surface-50 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-sm text-surface-800 truncate">
                        {detail.userName || detail.userEmail || "Anonymous"}
                      </span>
                      {detail.isTicket && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          🎫 Ticket #{detail.ticketShort}
                        </span>
                      )}
                      {(() => {
                        const summary = list.find((c) => c.id === detail.id);
                        if (summary?.hasUnansweredReply) {
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                              📥 New reply — needs response
                            </span>
                          );
                        }
                        return null;
                      })()}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        detail.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-surface-200 text-surface-500"
                      }`}>{detail.status}</span>
                    </div>
                    {detail.userEmail && (
                      <div className="text-[11px] text-surface-500">📧 {detail.userEmail}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={generateDraft}
                      disabled={generating}
                      className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 text-[11px] font-bold disabled:opacity-50"
                      title="AI draft based on this ticket"
                    >
                      {generating ? "Generating…" : "🤖 AI Draft"}
                    </button>
                    <button
                      onClick={openPasteModal}
                      className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-bold"
                      title="Paste a customer reply you received elsewhere"
                    >
                      📋 Paste reply
                    </button>
                    <button
                      onClick={() => toggleStatus(detail.status === "OPEN" ? "CLOSED" : "OPEN")}
                      className="px-2.5 py-1 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-[11px] font-semibold"
                    >
                      {detail.status === "OPEN" ? "✕ Close" : "↻ Reopen"}
                    </button>
                  </div>
                </div>

                {detail.ticketProblem && (
                  <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-[12px] text-surface-800">
                    <div className="font-semibold mb-0.5">Ticket issue:</div>
                    <div>{detail.ticketProblem}</div>
                  </div>
                )}
              </div>

              {/* Thread */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-surface-50">
                {detail.messages.map((m) => {
                  const isEmailSent = m.kind === "email_sent";
                  const isEmailRecv = m.kind === "email_received";
                  const align = m.role === "USER" ? "justify-end" : "justify-start";

                  if (isEmailSent || isEmailRecv) {
                    return (
                      <div key={m.id} className="flex justify-start">
                        <div className={`max-w-[90%] w-full rounded-xl border px-3 py-2 text-[12px] ${
                          isEmailSent
                            ? "bg-blue-50 border-blue-200"
                            : "bg-amber-50 border-amber-200"
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${
                              isEmailSent ? "text-blue-700" : "text-amber-700"
                            }`}>
                              {isEmailSent ? "📤 Email Sent" : "📥 Email Received"}
                            </span>
                            <span className="text-[9px] text-surface-400">{formatDate(m.createdAt)}</span>
                          </div>
                          <div className="text-[12px] whitespace-pre-wrap text-surface-800">{m.content}</div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={`flex ${align}`}>
                      <div className="max-w-[80%]">
                        <div className={`text-[9px] font-medium mb-px ml-1 ${
                          m.role === "ADMIN" ? "text-blue-600" : m.role === "ASSISTANT" ? "text-surface-400" : "text-surface-400"
                        }`}>
                          {m.role === "ADMIN" ? "Admin" : m.role === "ASSISTANT" ? "AI" : "User"}
                        </div>
                        <div className={`rounded-xl px-3 py-1.5 text-[12px] whitespace-pre-wrap ${
                          m.role === "USER"
                            ? "bg-red-500 text-white"
                            : m.role === "ADMIN"
                            ? "bg-blue-50 text-surface-800 border border-blue-100"
                            : "bg-white text-surface-800 border border-surface-200"
                        }`}>
                          {m.content}
                        </div>
                        <div className={`text-[9px] text-surface-400 mt-px ${m.role === "USER" ? "text-right" : "text-left"}`}>
                          {formatDate(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {draftOpen && (
                <div className="border-t border-purple-200 bg-purple-50 px-4 py-2 flex items-center justify-between shrink-0">
                  <span className="text-[12px] font-semibold text-purple-700">✉️ Email draft is open in the editor</span>
                  <button
                    type="button"
                    onClick={() => setDraftOpen(false)}
                    className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold underline"
                  >
                    close draft
                  </button>
                </div>
              )}

              {feedback && (
                <div className="border-t border-surface-200 px-4 py-2 bg-surface-50 text-[11px] font-semibold text-surface-700">
                  {feedback}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* ─── EMAIL DRAFT MODAL ─── */}
      {draftOpen && detail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setDraftOpen(false)}>
          <div
            ref={draftRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-surface-200 bg-purple-50 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">✉️</span>
                  <h2 className="text-lg font-bold text-surface-900">Email draft</h2>
                  {draftIsFallback && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      starter (AI unavailable)
                    </span>
                  )}
                  {detail.isTicket && (
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      🎫 Ticket #{detail.ticketShort}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-surface-500 mt-0.5">
                  Sending from <strong>support@votetofeed.com</strong> to <strong>{detail.userEmail || "(no email on file)"}</strong> via Resend
                </p>
              </div>
              <button
                onClick={() => setDraftOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-surface-100 text-surface-700 text-sm font-semibold border border-surface-200"
              >
                ✕ Close
              </button>
            </div>

            {draftIsFallback && draftFallbackReason && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900">
                <strong>⚠️ AI couldn&apos;t generate a contextual reply.</strong> Showing a starter template you can edit manually.
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-amber-700 hover:text-amber-900 font-semibold">Show technical details</summary>
                  <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-all bg-amber-100 px-2 py-1 rounded">{draftFallbackReason}</pre>
                </details>
              </div>
            )}

            {/* Modal body — split edit / preview */}
            <div className="flex-1 overflow-hidden grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-surface-200">
              <div className="p-5 overflow-y-auto">
                <label className="block text-xs font-semibold text-surface-600 mb-1">Subject</label>
                <input
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <label className="block text-xs font-semibold text-surface-600 mb-1 mt-4">Body</label>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  rows={16}
                  className="w-full resize-none rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={generateDraft}
                    disabled={generating}
                    className="px-3 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-semibold disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "🔁 Regenerate with AI"}
                  </button>
                </div>

                {detail.ticketProblem && (
                  <div className="mt-4 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-[12px] text-surface-800">
                    <div className="font-semibold mb-0.5 text-[11px] text-purple-700 uppercase tracking-wider">Customer asked:</div>
                    <div>{detail.ticketProblem}</div>
                  </div>
                )}
              </div>

              <div className="p-5 bg-surface-50 overflow-y-auto">
                <div className="text-xs font-semibold text-surface-600 mb-2">Preview (what the customer sees)</div>
                <div className="rounded-xl border border-surface-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-4 bg-gradient-to-r from-red-600 to-red-500 text-white text-center">
                    <div className="text-xl font-black tracking-tight">🐾 VoteToFeed</div>
                    <div className="text-[11px] opacity-80 uppercase tracking-wider mt-1">Every vote feeds a shelter pet</div>
                  </div>
                  <div className="px-5 py-3 bg-surface-50 border-b border-surface-200 text-[12px] text-surface-500 space-y-0.5">
                    <div><span className="font-semibold text-surface-600">From:</span> VoteToFeed Support &lt;support@votetofeed.com&gt;</div>
                    <div><span className="font-semibold text-surface-600">To:</span> {detail.userEmail || "(no email)"}</div>
                    <div><span className="font-semibold text-surface-600">Subject:</span> <span className="text-surface-800 font-semibold">{draftSubject || "(no subject)"}</span></div>
                  </div>
                  <div className="px-5 py-5 text-[14px] text-surface-800 leading-relaxed">
                    <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2">💬 New Support Reply</div>
                    <div className="text-lg font-black text-surface-900 mb-3">Hello!</div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 whitespace-pre-wrap text-[14px] leading-relaxed">
                      {draftBody || <span className="text-surface-400 italic">Body is empty…</span>}
                    </div>
                    <p className="mt-4 text-[13px] text-surface-600">Just reply to this email and we&apos;ll see your message right in your support thread.</p>
                    <p className="mt-2 text-[11px] text-surface-400">Ticket #{detail.ticketShort}</p>
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
                {detail.userEmail
                  ? "Customer can reply to this email and it will appear back in this thread."
                  : "⚠️ This conversation has no email on file — sending will fail."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDraftOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={sendDraft}
                  disabled={sending || !draftBody.trim() || !detail.userEmail}
                  className="px-5 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "Sending…" : "📨 Send via Resend"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── PASTE CUSTOMER REPLY MODAL ─── */}
      {pasteOpen && detail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPasteOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-surface-200 bg-amber-50 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <h2 className="text-lg font-bold text-surface-900">Paste customer reply</h2>
                  {detail.isTicket && (
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      🎫 Ticket #{detail.ticketShort}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-surface-600 mt-0.5">
                  Got an email reply in Gmail/Outlook? Paste it here to add it to this ticket thread.
                </p>
              </div>
              <button
                onClick={() => setPasteOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-surface-100 text-surface-700 text-sm font-semibold border border-surface-200"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">From email (optional)</label>
                <input
                  value={pasteFrom}
                  onChange={(e) => setPasteFrom(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="mt-1 text-[10px] text-surface-400">Pre-filled from ticket. Adjust if the customer used a different address.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Subject</label>
                <input
                  value={pasteSubject}
                  onChange={(e) => setPasteSubject(e.target.value)}
                  className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Body — paste exactly what the customer wrote</label>
                <textarea
                  value={pasteBody}
                  onChange={(e) => setPasteBody(e.target.value)}
                  rows={10}
                  placeholder="Paste the full message the customer sent…"
                  className="w-full resize-none rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                />
              </div>
            </div>

            <div className="px-6 py-3 border-t border-surface-200 bg-white flex items-center justify-between shrink-0">
              <p className="text-[11px] text-surface-500">
                Will appear as <strong>📥 Email Received</strong> in this thread and trigger the &quot;Awaiting reply&quot; badge.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPasteOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={savePastedReply}
                  disabled={pasting || !pasteBody.trim()}
                  className="px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pasting ? "Saving…" : "📥 Add to thread"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
