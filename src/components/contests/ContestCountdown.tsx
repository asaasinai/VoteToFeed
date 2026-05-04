"use client";
import { useEffect, useState } from "react";

export function ContestCountdown({ endDate }: { endDate: string }) {
  const [label, setLabel] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function calc() {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) { setLabel("Ended"); return; }

      const totalHours = diff / 3600000;
      setUrgent(totalHours < 48);

      if (totalHours < 1) {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setLabel(`${m}m ${String(s).padStart(2, "0")}s`);
      } else if (totalHours < 24) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setLabel(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
      } else {
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        setLabel(`${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`);
      }
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [endDate]);

  if (!label) return <span className="text-2xl font-bold text-surface-900">...</span>;

  return (
    <span className={`text-2xl font-bold font-mono tabular-nums ${urgent ? "text-red-600 animate-pulse" : "text-surface-900"}`}>
      {label}
    </span>
  );
}
