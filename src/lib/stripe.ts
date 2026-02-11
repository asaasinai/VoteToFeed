import Stripe from "stripe";

// Synchronous version — uses env vars only (for build-time / static contexts)
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set — configure in Admin > Settings or .env");
  return new Stripe(key);
}

// Async version — checks DB admin settings first, falls back to env
export async function getStripeAsync(): Promise<Stripe> {
  // Dynamic import to avoid circular deps at build time
  const { getStripeSecretKey } = await import("./admin-settings");
  const key = await getStripeSecretKey();
  if (!key) throw new Error("Stripe secret key is not configured — set it in Admin > Settings or .env");
  return new Stripe(key);
}

export const STRIPE_PRICE_IDS: Record<string, string> = {
  // These would be actual Stripe Price IDs in production
  STARTER: "price_starter",
  FRIEND: "price_friend",
  SUPPORTER: "price_supporter",
  CHAMPION: "price_champion",
  HERO: "price_hero",
  LEGEND: "price_legend",
};
