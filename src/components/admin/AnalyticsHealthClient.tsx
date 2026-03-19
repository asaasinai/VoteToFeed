"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { readStoredAttribution, trackPostHogEvent } from "@/lib/analytics";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

type Props = {
  config: {
    appUrl: string;
    clarityConfigured: boolean;
    posthogConfigured: boolean;
    metaConfigured: boolean;
  };
};

type ClientStatus = {
  currentUrl: string;
  clarityLoaded: boolean;
  posthogLoaded: boolean;
  metaLoaded: boolean;
  cloudflareLoaded: boolean;
  posthogDistinctId?: string;
  attribution: Record<string, unknown> | null;
  analyticsResources: string[];
};

export function AnalyticsHealthClient({ config }: Props) {
  const [clientStatus, setClientStatus] = useState<ClientStatus | null>(null);

  useEffect(() => {
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /clarity|posthog|facebook|fbevents|cloudflare/i.test(name));

    const nextStatus: ClientStatus = {
      currentUrl: window.location.href,
      clarityLoaded: typeof window.clarity === "function" || resources.some((name) => /clarity/i.test(name)),
      posthogLoaded: resources.some((name) => /posthog/i.test(name)),
      metaLoaded: typeof window.fbq === "function" || resources.some((name) => /facebook|fbevents/i.test(name)),
      cloudflareLoaded: resources.some((name) => /cloudflare/i.test(name)),
      posthogDistinctId: config.posthogConfigured ? posthog.get_distinct_id?.() : undefined,
      attribution: readStoredAttribution(),
      analyticsResources: resources,
    };

    setClientStatus(nextStatus);
    trackPostHogEvent("analytics_health_viewed", {
      clarity_loaded: nextStatus.clarityLoaded,
      posthog_loaded: nextStatus.posthogLoaded,
      meta_loaded: nextStatus.metaLoaded,
      cloudflare_loaded: nextStatus.cloudflareLoaded,
    });
  }, [config.posthogConfigured]);

  const checks = [
    { label: "Clarity configured", ok: config.clarityConfigured },
    { label: "PostHog configured", ok: config.posthogConfigured },
    { label: "Meta Pixel configured", ok: config.metaConfigured },
    { label: "Clarity loaded in browser", ok: clientStatus?.clarityLoaded ?? false },
    { label: "PostHog loaded in browser", ok: clientStatus?.posthogLoaded ?? false },
    { label: "Meta Pixel loaded in browser", ok: clientStatus?.metaLoaded ?? false },
    { label: "Cloudflare analytics loaded", ok: clientStatus?.cloudflareLoaded ?? false },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-lg font-bold text-surface-900">Analytics health</h2>
          <p className="text-sm text-surface-500 mt-1">Fast sanity-check page for humans or agents.</p>
          <div className="mt-5 space-y-3">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center justify-between rounded-xl border border-surface-100 px-4 py-3">
                <span className="text-sm text-surface-700">{check.label}</span>
                <span className={`text-xs font-bold uppercase tracking-wide ${check.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {check.ok ? "OK" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-bold text-surface-900">Where to watch traffic</h2>
          <ul className="mt-4 space-y-3 text-sm text-surface-700">
            <li><strong>PostHog:</strong> use this as the primary funnel + attribution + replay view.</li>
            <li><strong>Microsoft Clarity:</strong> use this for session replay and behavior review.</li>
            <li><strong>Meta Events Manager:</strong> use this for paid traffic attribution sanity checks.</li>
            <li><strong>Cloudflare Analytics:</strong> use this for lightweight traffic volume checks.</li>
          </ul>
          <div className="mt-5 rounded-xl bg-surface-50 border border-surface-100 p-4 text-sm text-surface-600">
            <p><strong>App URL:</strong> {config.appUrl}</p>
            {clientStatus?.posthogDistinctId && <p className="mt-1"><strong>Current PostHog distinct ID:</strong> {clientStatus.posthogDistinctId}</p>}
            {clientStatus?.currentUrl && <p className="mt-1"><strong>Current page:</strong> {clientStatus.currentUrl}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-lg font-bold text-surface-900">First-touch attribution</h2>
          <p className="text-sm text-surface-500 mt-1">What this browser has stored for UTM / referrer context.</p>
          <pre className="mt-4 rounded-xl bg-surface-950 text-surface-100 text-xs p-4 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(clientStatus?.attribution || {}, null, 2)}
          </pre>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-bold text-surface-900">Observed analytics resources</h2>
          <p className="text-sm text-surface-500 mt-1">Browser-level proof that client trackers loaded.</p>
          <div className="mt-4 rounded-xl border border-surface-100 overflow-hidden">
            {clientStatus?.analyticsResources?.length ? (
              <ul className="divide-y divide-surface-100 text-xs text-surface-700">
                {clientStatus.analyticsResources.map((resource) => (
                  <li key={resource} className="px-4 py-2 break-all">{resource}</li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 text-sm text-surface-400">No analytics resources detected yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-bold text-surface-900">Tracked funnel events</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-surface-700">
          {[
            "landing_attribution_captured",
            "analytics_booted",
            "auth_provider_click",
            "auth_signup_started",
            "auth_signup_completed",
            "pet_photo_upload_completed",
            "pet_entry_completed",
            "vote_cast",
            "vote_paywall_shown",
            "checkout_started",
            "checkout_completed",
            "checkout_cancelled",
            "analytics_health_viewed",
          ].map((eventName) => (
            <div key={eventName} className="rounded-xl border border-surface-100 px-4 py-3 font-mono text-xs">
              {eventName}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
