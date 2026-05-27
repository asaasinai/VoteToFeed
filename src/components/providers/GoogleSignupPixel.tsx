"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { trackVoteToFeedEvent, getCreativeSource } from "@/lib/meta-pixel";
import { trackPostHogEvent } from "@/lib/analytics";

const DEDUP_KEY = "vtf_meta_google_reg_tracked";
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Fires Meta Pixel CompleteRegistration for new Google OAuth sign-ups.
 * Mounted globally in the layout so it works regardless of which page
 * the user lands on after OAuth (dashboard, pets/new, etc.).
 *
 * Dedup: sessionStorage prevents re-firing on page refresh.
 * Staleness: the 1-hour window ensures we skip stale tokens.
 */
export function GoogleSignupPixel() {
  const { data: session } = useSession();
  const newGoogleUserAt = session?.user?.newGoogleUserAt;

  useEffect(() => {
    if (!newGoogleUserAt) return;
    if (Date.now() - newGoogleUserAt > ONE_HOUR_MS) return;
    if (sessionStorage.getItem(DEDUP_KEY) === "1") return;

    trackVoteToFeedEvent("CompleteRegistration", {
      content_name: "VoteToFeed_AccountSignup",
      content_category: "VoteToFeed_Account",
      source: getCreativeSource(),
      value: 0.10,
    });
    trackPostHogEvent("auth_signup_completed", { method: "google" });
    sessionStorage.setItem(DEDUP_KEY, "1");
  }, [newGoogleUserAt]);

  return null;
}
