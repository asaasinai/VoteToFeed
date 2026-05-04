"use client";
import { useEffect, useRef, useState } from "react";

type Entry = {
  id: string;
  name: string;
  photos: string[];
  type: string;
  votes: number;
  momentum?: number;
};

type Toast = { id: number; text: string };

type Props = {
  contestId: string;
  initialEntries: Entry[];
  pollInterval?: number;
};

const MEDALS = ["🥇", "🥈", "🥉"];
const BAR_COLORS = [
  "from-yellow-400 to-amber-400",
  "from-slate-300 to-slate-400",
  "from-orange-300 to-amber-400",
  "from-brand-400 to-brand-500",
  "from-violet-400 to-purple-400",
];

let _toastId = 0;

export function ContestLiveBattle({ contestId, initialEntries }: Props) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [flash, setFlash] = useState<string | null>(null);
  const [secsAgo, setSecsAgo] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [overtakeBanner, setOvertakeBanner] = useState<string | null>(null);
  const [watching, setWatching] = useState(() => 8 + (contestId.charCodeAt(0) % 35));
  const lastPulseRef = useRef(Date.now());
  const prevRef = useRef<Map<string, number>>(new Map(initialEntries.map((e) => [e.id, e.votes])));
  const prevRanksRef = useRef<Map<string, number>>(new Map(initialEntries.map((e, i) => [e.id, i + 1])));

  // Live "X seconds ago" ticker
  useEffect(() => {
    const t = setInterval(() => {
      setSecsAgo(Math.round((Date.now() - lastPulseRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Watching counter — slowly drifts
  useEffect(() => {
    const t = setInterval(() => {
      setWatching((w) => Math.max(5, Math.min(99, w + Math.floor(Math.random() * 5) - 2)));
    }, 7000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/contests/${contestId}/live?limit=5`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const next: Entry[] = data.entries ?? [];

        // Toast + flash when someone votes
        let flashId: string | null = null;
        for (const entry of next) {
          const prev = prevRef.current.get(entry.id) ?? 0;
          if (entry.votes > prev) {
            flashId = entry.id;
            const id = ++_toastId;
            setToasts((t) => [...t.slice(-2), { id, text: `🔥 Someone just voted for ${entry.name}!` }]);
            setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
            break;
          }
        }
        prevRef.current = new Map(next.map((entry) => [entry.id, entry.votes]));

        // Overtake detection
        for (let i = 1; i < next.length; i++) {
          const prevRank = prevRanksRef.current.get(next[i].id);
          if (prevRank !== undefined && prevRank > i + 1) {
            const displaced = next[i - 1]?.name ?? "...";
            setOvertakeBanner(`⚡ ${next[i].name} just overtook ${displaced} for #${i + 1}!`);
            setTimeout(() => setOvertakeBanner(null), 5000);
            break;
          }
        }
        prevRanksRef.current = new Map(next.map((entry, idx) => [entry.id, idx + 1]));

        setEntries(next);
        lastPulseRef.current = Date.now();
        setSecsAgo(0);
        if (flashId) {
          setFlash(flashId);
          setTimeout(() => setFlash(null), 1500);
        }
      } catch { /* ignore parse errors */ }
    };

    return () => es.close();
  }, [contestId]);

  void secsAgo; // suppress unused warning
  const topVotes = entries[0]?.votes ?? 1;

  return (
    <div className="mb-6 rounded-2xl border border-surface-200 bg-gradient-to-br from-surface-50 to-white overflow-hidden relative">
      {/* Floating toasts */}
      <div className="absolute top-12 right-3 z-20 flex flex-col gap-1.5 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-surface-900/90 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg animate-slide-up backdrop-blur-sm"
          >
            {toast.text}
          </div>
        ))}
      </div>

      {/* Overtake banner */}
      {overtakeBanner && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow animate-slide-up flex items-center gap-2">
          {overtakeBanner}
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-100 flex items-center gap-2">
        <span className="text-base">🔥</span>
        <span className="text-sm font-bold text-surface-900">Top Contenders — Live Battle</span>
        <span className="ml-2 flex items-center gap-1 text-[10px] text-surface-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          {watching} watching
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
          LIVE
        </span>
      </div>
      <div className="p-4 space-y-3">
        {entries.map((entry, i) => {
          const pct = topVotes > 0 ? Math.round((entry.votes / topVotes) * 100) : 0;
          const photo = entry.photos?.[0];
          const barColor = BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)];
          const gap = i > 0 ? Math.max(1, (entries[i - 1]?.votes ?? 0) - entry.votes + 1) : 0;
          const isFlashing = flash === entry.id;

          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 rounded-xl px-2 py-1 transition-all duration-500 ${isFlashing ? "bg-emerald-50 ring-1 ring-emerald-300" : ""}`}
            >
              <span className="text-lg w-6 text-center flex-shrink-0">{MEDALS[i] ?? `#${i + 1}`}</span>
              <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-100 flex-shrink-0 ring-2 ring-white shadow-sm">
                {photo ? (
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg flex items-center justify-center h-full">
                    {entry.type === "DOG" ? "🐶" : "🐱"}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-surface-800 truncate flex items-center gap-1.5">
                    {entry.name}
                    {isFlashing && (
                      <span className="text-[10px] font-bold text-emerald-600 animate-bounce">+vote!</span>
                    )}
                    {(entry.momentum ?? 0) >= 3 && (
                      <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full shrink-0">
                        🔥 {entry.momentum}  /10m
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-surface-700 ml-2 shrink-0 tabular-nums">
                    {entry.votes.toLocaleString()} votes
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {i > 0 && gap > 0 && (
                  <p className="text-[10px] text-surface-400 mt-0.5">
                    <span className="text-brand-500 font-semibold">+{gap.toLocaleString()} votes</span> to overtake{" "}
                    {entries[i - 1]?.name}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {entries.length === 0 && (
          <p className="text-xs text-surface-400 text-center py-4">No contestants yet</p>
        )}
      </div>

    </div>
  );
}
