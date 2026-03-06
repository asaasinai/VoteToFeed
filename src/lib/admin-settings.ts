import prisma from "./prisma";

// Default settings
const DEFAULTS: Record<string, string> = {
  meal_rate: "10.0",
  animal_type: "dogs",
  weekly_vote_goal: "100000",
  terms_of_service: "",
  privacy_policy: "",
  // Free vote allocation
  free_votes_amount: "5",
  free_votes_period: "weekly", // daily, weekly, monthly
  free_votes_reset_day: "0",  // 0=Sunday (for weekly), 1-28 (for monthly)
  free_votes_reset_hour: "19", // UTC hour (19 = 11 AM PST / noon EST)
  free_votes_reset_minute: "59", // UTC minute
  // Stripe keys (stored in DB, env vars as fallback)
  stripe_secret_key: "",
  stripe_publishable_key: "",
  stripe_webhook_secret: "",
  // Google OAuth
  google_client_id: "",
  google_client_secret: "",
  // Facebook OAuth
  facebook_client_id: "",
  facebook_client_secret: "",
  // NextAuth
  nextauth_secret: "",
  nextauth_url: "",
  // App
  app_url: "",
  // Resend
  resend_api_key: "",
  resend_from_email: "",
  // PostHog
  posthog_key: "",
};

export async function getSetting(key: string): Promise<string> {
  const setting = await prisma.adminSetting.findUnique({ where: { key } });
  return setting?.value ?? DEFAULTS[key] ?? "";
}

export async function getMealRate(): Promise<number> {
  const val = await getSetting("meal_rate");
  return parseFloat(val) || 10.0;
}

export async function getAnimalType(): Promise<string> {
  return getSetting("animal_type");
}

export async function getWeeklyVoteGoal(): Promise<number> {
  const val = await getSetting("weekly_vote_goal");
  return parseInt(val) || 100000;
}

export async function updateSetting(
  key: string,
  value: string,
  changedBy: string
): Promise<void> {
  const existing = await prisma.adminSetting.findUnique({ where: { key } });

  if (existing) {
    await prisma.$transaction([
      prisma.adminSettingLog.create({
        data: {
          settingId: existing.id,
          oldValue: existing.value,
          newValue: value,
          changedBy,
        },
      }),
      prisma.adminSetting.update({
        where: { key },
        data: { value, updatedBy: changedBy },
      }),
    ]);
  } else {
    await prisma.adminSetting.create({
      data: { key, value, updatedBy: changedBy },
    });
  }
}

export async function getTermsOfService(): Promise<string> {
  return getSetting("terms_of_service");
}

export async function getPrivacyPolicy(): Promise<string> {
  return getSetting("privacy_policy");
}

// Free vote configuration
export async function getFreeVotesConfig(): Promise<{
  amount: number;
  period: "daily" | "weekly" | "monthly";
  resetDay: number;
  resetHour: number;
  resetMinute: number;
}> {
  const [amount, period, resetDay, resetHour, resetMinute] = await Promise.all([
    getSetting("free_votes_amount"),
    getSetting("free_votes_period"),
    getSetting("free_votes_reset_day"),
    getSetting("free_votes_reset_hour"),
    getSetting("free_votes_reset_minute"),
  ]);
  return {
    amount: parseInt(amount) || 5,
    period: (period as "daily" | "weekly" | "monthly") || "weekly",
    resetDay: parseInt(resetDay) || 0,
    resetHour: parseInt(resetHour) || 19,
    resetMinute: parseInt(resetMinute) || 59,
  };
}

export async function getFreeVotesAmount(): Promise<number> {
  const val = await getSetting("free_votes_amount");
  return parseInt(val) || 5;
}

// Stripe keys — DB first, env fallback
export async function getStripeSecretKey(): Promise<string> {
  const dbKey = await getSetting("stripe_secret_key");
  return dbKey || process.env.STRIPE_SECRET_KEY || "";
}

export async function getStripePublishableKey(): Promise<string> {
  const dbKey = await getSetting("stripe_publishable_key");
  return dbKey || process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
}

export async function getStripeWebhookSecret(): Promise<string> {
  const dbKey = await getSetting("stripe_webhook_secret");
  return dbKey || process.env.STRIPE_WEBHOOK_SECRET || "";
}

// Google OAuth — DB first, env fallback
export async function getGoogleClientId(): Promise<string> {
  const dbKey = await getSetting("google_client_id");
  return dbKey || process.env.GOOGLE_CLIENT_ID || "";
}
export async function getGoogleClientSecret(): Promise<string> {
  const dbKey = await getSetting("google_client_secret");
  return dbKey || process.env.GOOGLE_CLIENT_SECRET || "";
}

// Facebook OAuth — DB first, env fallback
export async function getFacebookClientId(): Promise<string> {
  const dbKey = await getSetting("facebook_client_id");
  return dbKey || process.env.FACEBOOK_CLIENT_ID || "";
}
export async function getFacebookClientSecret(): Promise<string> {
  const dbKey = await getSetting("facebook_client_secret");
  return dbKey || process.env.FACEBOOK_CLIENT_SECRET || "";
}

// NextAuth — DB first, env fallback
export async function getNextAuthSecret(): Promise<string> {
  const dbKey = await getSetting("nextauth_secret");
  return dbKey || process.env.NEXTAUTH_SECRET || "";
}
export async function getNextAuthUrl(): Promise<string> {
  const dbKey = await getSetting("nextauth_url");
  return dbKey || process.env.NEXTAUTH_URL || "";
}

// App URL — DB first, env fallback
export async function getAppUrl(): Promise<string> {
  const dbKey = await getSetting("app_url");
  return dbKey || process.env.NEXT_PUBLIC_APP_URL || "";
}

// Resend — DB first, env fallback
export async function getResendApiKey(): Promise<string> {
  const dbKey = await getSetting("resend_api_key");
  return dbKey || process.env.RESEND_API_KEY || "";
}
export async function getResendFromEmail(): Promise<string> {
  const dbKey = await getSetting("resend_from_email");
  return dbKey || process.env.RESEND_FROM_EMAIL || "";
}

// Get all settings as object (masks sensitive keys for client)
export async function getAllSettings(): Promise<Record<string, string>> {
  const settings = await prisma.adminSetting.findMany();
  const result: Record<string, string> = { ...DEFAULTS };
  for (const s of settings) {
    result[s.key] = s.value;
  }
  return result;
}

// Mask a key for display (show last 4 chars)
export function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "••••" : "";
  return "••••••••" + key.slice(-4);
}
