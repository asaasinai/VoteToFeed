import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";
import { rankSuffix, VOTE_PACKAGES } from "@/lib/utils";

// Use a friendly from-address — "noreply@" is a well-known spam trigger
const FROM_EMAIL = "VoteToFeed <hello@votetofeed.com>";

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export function buildUnsubscribeUrl(email: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "";
  const token = createHmac("sha256", secret).update(email.toLowerCase()).digest("hex");
  const base = appUrl();
  return `${base}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

/** Verify an unsubscribe token (used in /api/unsubscribe route). */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET || "";
  const expected = createHmac("sha256", secret).update(email.toLowerCase()).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

/**
 * Strip HTML tags and decode common entities for plain-text fallback.
 * Required for inbox placement — HTML-only emails score higher on spam filters.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|table|td|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\u200d/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/(\n\s*){3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(
  payload: Parameters<ReturnType<typeof getResend>["emails"]["send"]>[0],
  { transactional = false }: { transactional?: boolean } = {},
) {
  const resend = getResend();

  // Auto-derive recipient email for the unsubscribe token
  const toEmail = !transactional
    ? (Array.isArray(payload.to) ? payload.to[0] : payload.to) as string | undefined
    : undefined;

  const unsubscribeUrl = toEmail ? buildUnsubscribeUrl(toEmail) : undefined;

  // Inject reply-to and (for bulk mail) List-Unsubscribe headers required by Gmail & Yahoo
  const finalPayload: Record<string, unknown> = {
    ...payload,
    reply_to: "hello@votetofeed.com",
    ...(unsubscribeUrl && {
      headers: {
        ...((payload as { headers?: Record<string, string> }).headers ?? {}),
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  };

  // Inject the unsubscribe URL into the HTML footer placeholder (<!--UNSUB_URL-->)
  if (typeof finalPayload.html === "string") {
    if (unsubscribeUrl) {
      finalPayload.html = (finalPayload.html as string)
        .replace(/<!--UNSUB_BLOCK_START-->/g, "")
        .replace(/<!--UNSUB_URL-->/g, unsubscribeUrl)
        .replace(/<!--UNSUB_BLOCK_END-->/g, "");
    } else {
      // Transactional emails: remove the block entirely
      finalPayload.html = (finalPayload.html as string).replace(
        /<!--UNSUB_BLOCK_START-->[\s\S]*?<!--UNSUB_BLOCK_END-->/g,
        "",
      );
    }
    // Auto-generate plain-text fallback if not provided — lowers spam score
    if (!finalPayload.text) {
      finalPayload.text = htmlToPlainText(finalPayload.html as string);
    }
  }

  const { data, error } = await resend.emails.send(
    finalPayload as unknown as Parameters<ReturnType<typeof getResend>["emails"]["send"]>[0],
  );
  if (error) {
    // Log full error so it shows in Vercel logs
    console.error("[Resend] email send failed:", JSON.stringify(error));
    throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
  }
  return data;
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
}

export function emailShell(content: string, preheader = "") {
  const url = appUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>VoteToFeed</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">🐾 VoteToFeed</p>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.80);letter-spacing:0.3px;text-transform:uppercase;">Every vote feeds a shelter pet</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#ffffff;padding:40px;color:#18181b;font-size:16px;line-height:1.7;">
            ${content}
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="background:#ffffff;padding:0 40px;">
            <div style="height:1px;background:#f1f5f9;"></div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:#71717a;">
              <a href="${url}" style="color:#ef4444;text-decoration:none;font-weight:600;">VoteToFeed</a>
              &nbsp;·&nbsp;
              <a href="${url}/privacy" style="color:#a1a1aa;text-decoration:none;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${url}/terms" style="color:#a1a1aa;text-decoration:none;">Terms</a>
            </p>
            <p style="margin:0 0 6px;font-size:12px;color:#a1a1aa;">You're receiving this because you have an account on VoteToFeed.</p>
            <!--UNSUB_BLOCK_START--><p style="margin:0;font-size:12px;"><a href="<!--UNSUB_URL-->" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe from these emails</a></p><!--UNSUB_BLOCK_END-->
            <p style="margin:8px 0 0;font-size:11px;color:#d4d4d8;">VoteToFeed · 2261 Market Street #4955 · San Francisco, CA 94114</p>
          </td>
        </tr>

        <!-- SHADOW SPACER -->
        <tr><td style="height:24px;"></td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function nominationEmailShell(content: string, preheader = "") {
  const url = appUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>VoteToFeed</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">🐾 VoteToFeed</p>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.80);letter-spacing:0.3px;text-transform:uppercase;">Every vote feeds a shelter pet</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:40px;color:#18181b;font-size:16px;line-height:1.7;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:0 40px;">
            <div style="height:1px;background:#f1f5f9;"></div>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:#71717a;">
              <a href="${url}" style="color:#ef4444;text-decoration:none;font-weight:600;">VoteToFeed</a>
              &nbsp;·&nbsp;
              <a href="${url}/privacy" style="color:#a1a1aa;text-decoration:none;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${url}/terms" style="color:#a1a1aa;text-decoration:none;">Terms</a>
            </p>
            <p style="margin:0 0 6px;font-size:12px;color:#a1a1aa;">You're receiving this because you have an account on VoteToFeed.</p>
            <!--UNSUB_BLOCK_START--><p style="margin:0;font-size:12px;"><a href="<!--UNSUB_URL-->" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe from these emails</a></p><!--UNSUB_BLOCK_END-->
            <p style="margin:8px 0 0;font-size:11px;color:#d4d4d8;">VoteToFeed · 2261 Market Street #4955 · San Francisco, CA 94114</p>
          </td>
        </tr>
        <tr><td style="height:24px;"></td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function ctaButton(label: string, href: string, color = "#ef4444") {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px;margin-bottom:8px;">
  <tr>
    <td style="border-radius:10px;background:${color};" bgcolor="${color}">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.1px;">
        ${label} →
      </a>
    </td>
  </tr>
</table>`;
}

export function infoBox(content: string, color = "#fef2f2", border = "#fca5a5") {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;">
  <tr>
    <td style="background:${color};border-left:4px solid ${border};border-radius:0 8px 8px 0;padding:16px 20px;font-size:15px;line-height:1.6;color:#18181b;">
      ${content}
    </td>
  </tr>
</table>`;
}

export function statRow(items: Array<{ label: string; value: string }>) {
  const cells = items.map(i => `
    <td align="center" style="padding:16px;border-right:1px solid #f1f5f9;">
      <p style="margin:0 0 4px;font-size:24px;font-weight:800;color:#ef4444;">${i.value}</p>
      <p style="margin:0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">${i.label}</p>
    </td>
  `).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;border:1px solid #f1f5f9;border-radius:12px;overflow:hidden;">
  <tr>${cells}</tr>
</table>`;
}

export async function sendVoteAlert(
  to: string,
  petName: string,
  voterName: string,
  voteCount: number,
  rank: number | null,
  animalType: string,
  isPaidVote: boolean
) {
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `🐾 ${petName} just got a new vote!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">New Vote</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${petName} received<br/>a new vote! 🎉</h1>
      ${infoBox(`<strong>${voterName}</strong> just voted for <strong>${petName}</strong>!${isPaidVote ? " And their vote helps feed a shelter pet. 🐾" : ""}`)}
      ${statRow([{ label: "Total Votes", value: String(voteCount) }, ...(rank ? [{ label: "Current Rank", value: `#${rank}` }] : [])])}
      ${ctaButton(`View ${petName}'s Profile`, `${appUrl()}/pets/${encodeURIComponent(petName)}`)}
    `, `${voterName} voted for ${petName} — ${voteCount} total votes!`),
  });
}

export async function sendPurchaseConfirmation(
  to: string,
  votes: number,
  amount: number,
  mealsProvided: number,
  animalType: string,
  petId?: string,
  petName?: string
) {
  const ctaUrl = petId ? `${appUrl()}/pets/${petId}` : appUrl();
  const ctaLabel = petName ? `Go vote for ${petName} now →` : "Start Voting Now";
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `✅ ${votes} votes added to your account!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">Purchase Confirmed</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${votes} votes added<br/>to your account! ✅</h1>
      ${statRow([{ label: "Votes Added", value: String(votes) }, { label: "Amount Paid", value: `$${(amount / 100).toFixed(2)}` }, { label: "Meals Provided", value: String(Math.round(mealsProvided)) }])}
      ${infoBox(`<strong>🐾 ${Math.round(mealsProvided)} shelter pets</strong> will be fed because of your vote. Thank you for making a difference!`, "#f0fdf4", "#86efac")}
      ${ctaButton(ctaLabel, ctaUrl, "#16a34a")}
    `, `${votes} votes added — you helped feed ${Math.round(mealsProvided)} shelter pets!`),
  });
}

export async function sendAbandonedCheckoutEmail(
  to: string,
  userName: string,
  tier: string,
  petId?: string,
  petName?: string
) {
  const tierLabels: Record<string, string> = {
    STARTER: "Starter Pack", FRIEND: "Friend Pack", SUPPORTER: "Supporter Pack",
    CHAMPION: "Champion Pack", HERO: "Hero Pack", LEGEND: "Legend Pack", ICON: "Icon Pack",
  };
  const tierName = tierLabels[tier] ?? tier;
  const ctaUrl = petId ? `${appUrl()}/dashboard?pet=${petId}&buy=${tier}` : `${appUrl()}/dashboard`;
  const petLine = petName ? `<p style="margin:0 0 16px;color:#52525b;font-size:16px;">You were buying votes for <strong>${petName}</strong> — they still need your support!</p>` : "";
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `🛒 You left your ${tierName} behind, ${userName}!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Almost There!</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">Your ${tierName} is<br/>waiting, ${userName}! 🛒</h1>
      ${petLine}
      ${infoBox(`Every vote you buy feeds a real shelter pet. <strong>Your purchase makes a difference. 🐾</strong>`)}
      ${ctaButton(`Complete My ${tierName} →`, ctaUrl, "#ef4444")}
      <p style="margin-top:20px;font-size:13px;color:#a1a1aa;">This offer won't last forever — complete your purchase now to keep your pet in the running!</p>
    `, `You left your ${tierName} behind — complete your purchase to support ${petName ?? "your pet"}!`),
  });
}

export async function sendFreeVoteReminder(
  to: string,
  userName: string,
  animalType: string,
  streak: number
) {
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `⏰ ${userName}, your free votes are waiting!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Weekly Reminder</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">Your free votes<br/>are waiting, ${userName}! ⏰</h1>
      <p style="margin:0 0 16px;color:#52525b;font-size:16px;">You still have <strong>5 free votes</strong> available this week — use them before Sunday at 11:59 PM PST or they expire.</p>
      ${streak > 0 ? infoBox(`🔥 <strong>${streak}-week streak!</strong> You're on a roll — don't break it now.`, "#fff7ed", "#fdba74") : ""}
      ${infoBox(`Each vote you cast helps feed a real shelter pet. <strong>Free votes count just as much as paid ones. 🐾</strong>`)}
      ${ctaButton("Cast My Free Votes →", appUrl())}
      <p style="margin-top:20px;font-size:13px;color:#a1a1aa;">Votes reset every Sunday. You'll get 5 fresh votes next week regardless.</p>
    `, `You have 5 free votes ready to cast this week, ${userName}!`),
  });
}

export async function sendWeeklyDigest(
  to: string,
  userName: string,
  pets: Array<{ name: string; votes: number; rank: number | null }>,
  totalMeals: number,
  animalType: string
) {
  const petRows = pets.map((p) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;font-weight:600;color:#18181b;">${p.name}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;color:#ef4444;font-weight:700;">${p.votes} votes</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;color:#71717a;">${p.rank ? `#${p.rank}` : "—"}</td>
    </tr>
  `).join("");

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `📊 Your weekly VoteToFeed summary, ${userName}`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Weekly Summary</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">Here's how your<br/>pets did this week 📊</h1>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #f1f5f9;border-radius:12px;overflow:hidden;margin:0 0 20px;">
        <tr style="background:#fafafa;">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #f1f5f9;">Pet</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #f1f5f9;">Votes</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #f1f5f9;">Rank</th>
        </tr>
        ${petRows}
      </table>
      ${infoBox(`🐾 Together, your votes helped feed <strong>${Math.round(totalMeals)} shelter pets</strong> this week. That's incredible — thank you!`, "#f0fdf4", "#86efac")}
      <p style="font-size:14px;color:#71717a;">Your 5 free votes reset <strong>Sunday at 11:59 PM PST</strong>. Don't let them go to waste.</p>
      ${ctaButton("Vote Again This Week", appUrl())}
    `, `Your weekly update — your votes fed ${Math.round(totalMeals)} shelter pets!`),
  });
}

export async function sendWinnerNotification(
  to: string,
  petName: string,
  placement: number,
  prizeValue: number,
  prizeItems: string[]
) {
  const placementLabels = ["1st Place 🥇", "2nd Place 🥈", "3rd Place 🥉"];
  const label = placementLabels[placement - 1] || `${placement}th Place`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `🏆 ${petName} Won ${label} — $${(prizeValue / 100).toLocaleString()} Prize!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;">Contest Winner</p>
      <h1 style="margin:0 0 20px;font-size:30px;font-weight:900;color:#18181b;line-height:1.2;">Congratulations! 🏆<br/>${petName} won ${label}!</h1>
      ${statRow([{ label: "Prize Value", value: `$${(prizeValue / 100).toLocaleString()}` }, { label: "Placement", value: label.split(" ")[0] + " " + label.split(" ")[1] }])}
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#18181b;">Your Prize Pack Includes:</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;">
        ${prizeItems.map(item => `<tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:15px;color:#3f3f46;">✅ &nbsp;${item}</td></tr>`).join("")}
      </table>
      ${infoBox(`📦 <strong>Shipping & fulfillment details</strong> will be sent in a separate email within 2 business days. Expect delivery in <strong>2–4 weeks</strong>.`, "#fff7ed", "#fdba74")}
    `, `${petName} won ${label} — $${(prizeValue / 100).toLocaleString()} prize pack!`),
  });
}

export async function sendContestCountdown(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  daysLeft: number
) {
  const urgencyColor = daysLeft <= 1 ? "#dc2626" : daysLeft <= 3 ? "#d97706" : "#ef4444";
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `⏰ ${daysLeft} day${daysLeft === 1 ? "" : "s"} left — ${petName} needs your help!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${urgencyColor};text-transform:uppercase;letter-spacing:1px;">${daysLeft <= 1 ? "🚨 Final Hours" : "⏰ Countdown"}</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${daysLeft} day${daysLeft === 1 ? "" : "s"} left for<br/>${petName} to win! ⏰</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">Hey ${userName}, <strong>${petName}</strong> is still competing in <strong>${contestName}</strong> — and every vote in the final stretch counts double for momentum.</p>
      ${infoBox(`<strong>Do this right now:</strong><br/>1. Vote for ${petName}<br/>2. Share the link with friends & family<br/>3. Buy extra votes if you want to guarantee a top placement`, "#fef2f2", "#fca5a5")}
      ${ctaButton("Vote for " + petName, `${appUrl()}/contests/${contestId}`, urgencyColor)}
      ${ctaButton("Buy Extra Votes", appUrl(), "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Every paid vote helps feed a shelter pet in need.</p>
    `, `Only ${daysLeft} day${daysLeft === 1 ? "" : "s"} left — rally votes for ${petName} in ${contestName}!`),
  });
}

// 14 rotating daily tips — one per day, cycles every 2 weeks
const DAILY_TIPS: Array<{ emoji: string; title: string; body: string }> = [
  { emoji: "📱", title: "Share on Instagram Stories", body: "Post a cute photo of your pet with the contest link in your story. Friends swipe up → free votes!" },
  { emoji: "👨‍👩‍👧‍👦", title: "Ask Family & Friends", body: "Send a quick text to 10 people: \"Hey, can you vote for my pet? Takes 2 seconds!\" You'd be surprised how many will." },
  { emoji: "📘", title: "Post in Facebook Groups", body: "Pet lover groups on Facebook are full of people who love voting. Share your pet's link in 2-3 groups today." },
  { emoji: "🔄", title: "Share Every Day", body: "People forget! Re-share your contest link daily — each new post reaches different followers at different times." },
  { emoji: "💬", title: "Use WhatsApp Broadcasts", body: "Create a broadcast list of friends & family. One message reaches everyone at once without a group chat." },
  { emoji: "📸", title: "Update Your Pet's Photo", body: "A fresh, high-quality photo gets more votes. Try natural lighting, eye-level angle, and a clean background." },
  { emoji: "🏆", title: "Mention the Prize", body: "When sharing, mention what you could win! People are more likely to help when they know the stakes." },
  { emoji: "⏰", title: "Post at Peak Times", body: "Share between 6-9 PM when most people are scrolling. Lunchtime (12-1 PM) is another sweet spot." },
  { emoji: "🐾", title: "Tell Your Pet's Story", body: "Write a short caption about why your pet deserves to win. Emotional stories get way more engagement." },
  { emoji: "💪", title: "Buy a Small Vote Boost", body: "Even a small vote package can jump you several spots. Plus, every paid vote feeds a shelter pet!" },
  { emoji: "🎯", title: "DM Your Closest Friends", body: "A personal DM asking for help is 10x more effective than a public post. Send 5 DMs right now!" },
  { emoji: "📧", title: "Email Your Contacts", body: "A quick email to coworkers, neighbors, or your kid's school group can bring in a wave of votes." },
  { emoji: "🎥", title: "Post a Short Video", body: "A 15-second video of your pet being adorable + \"vote for us!\" gets way more engagement than a photo alone." },
  { emoji: "🤝", title: "Team Up with Other Contestants", body: "Find other contestants and agree to vote for each other. Rising tides lift all boats!" },
];

function getDailyTip(): (typeof DAILY_TIPS)[number] {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
}

export async function sendDailyRankEmail(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  rank: number,
  totalEntries: number,
  votesNeededForTop3: number,
  votesNeededFor1st: number,
  daysLeft: number,
  prizeDescription?: string | null,
) {
  const url = appUrl();
  const tip = getDailyTip();
  const isTop3 = votesNeededForTop3 <= 0;
  const is1st = rank === 1;

  // Dynamic subject line based on position
  const subject = is1st
    ? `🥇 ${petName} is #1! Don't let anyone catch up`
    : isTop3
    ? `🏆 ${petName} is #${rank} — hold your spot!`
    : rank <= 5
    ? `🔥 ${petName} is #${rank} — so close to top 3!`
    : `📈 ${petName} is #${rank} — here's how to climb`;

  // Dynamic heading
  const heading = is1st
    ? `${petName} is #1! 🥇`
    : isTop3
    ? `${petName} is in the top 3! 🏆`
    : rank <= 5
    ? `${petName} is almost there!`
    : `${petName}'s daily update`;

  // Dynamic message based on position
  let positionMessage: string;
  if (is1st) {
    positionMessage = `<strong>${petName} is leading ${contestName}!</strong> You're in 1st place — but the competition is close. Keep sharing to protect your spot.`;
  } else if (isTop3) {
    positionMessage = `<strong>${petName} is ranked #${rank}</strong> in ${contestName} — that's a winning position! You need <strong>${votesNeededFor1st} more vote${votesNeededFor1st === 1 ? "" : "s"}</strong> to take the lead.`;
  } else if (rank <= 5) {
    positionMessage = `<strong>${petName} is #${rank}</strong> — just <strong>${votesNeededForTop3} vote${votesNeededForTop3 === 1 ? "" : "s"}</strong> from the top 3! That's totally doable today. Share the link and ask a few friends.`;
  } else if (rank <= 10) {
    positionMessage = `<strong>${petName} is ranked #${rank}</strong> out of ${totalEntries} entries. You need <strong>${votesNeededForTop3} votes</strong> to break into the top 3 — a good sharing push today could change everything!`;
  } else {
    positionMessage = `<strong>${petName} is ranked #${rank}</strong> out of ${totalEntries}. ${daysLeft > 2 ? `There are still ${daysLeft} days left — plenty of time for a comeback!` : "It's not over yet — big swings happen in the final days!"} Every vote counts, and today's tip can help.`;
  }

  // Prize section
  const prizeSection = prizeDescription
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;border:1px solid #fde68a;border-radius:12px;overflow:hidden;background:#fffbeb;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.5px;">🎁 What You Could Win</p>
            <p style="margin:0;font-size:15px;color:#78350f;line-height:1.6;">${prizeDescription}</p>
          </td>
        </tr>
      </table>`
    : "";

  // Tip of the day section
  const tipSection = `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;border:1px solid #c7d2fe;border-radius:12px;overflow:hidden;background:#eef2ff;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:0.5px;">${tip.emoji} Tip of the Day</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#312e81;">${tip.title}</p>
        <p style="margin:0;font-size:14px;color:#3730a3;line-height:1.6;">${tip.body}</p>
      </td>
    </tr>
  </table>`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Daily Contest Update</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${heading}</h1>
      ${statRow([
        { label: "Current Rank", value: `#${rank}` },
        { label: is1st ? "Lead" : "To #1", value: is1st ? "You're #1!" : `${votesNeededFor1st} votes` },
        { label: "Days Left", value: daysLeft > 0 ? `${daysLeft}d` : "Final day!" },
      ])}
      ${infoBox(positionMessage, isTop3 ? "#f0fdf4" : "#fef2f2", isTop3 ? "#86efac" : "#fca5a5")}
      ${prizeSection}
      ${tipSection}
      ${ctaButton("Vote & Share Now", `${url}/contests/${contestId}`)}
      ${!is1st ? ctaButton("Buy Votes — Jump the Ranks", `${url}/dashboard#votes`, "#71717a") : ""}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Every vote feeds shelter pets — win or not, you're making a difference.</p>
    `, `${petName} is #${rank} in ${contestName} — ${daysLeft}d left. ${is1st ? "Defend your lead!" : `${votesNeededFor1st} votes to #1`}`),
  });
}

// ─── ENGAGEMENT EMAILS (automated, push to buy votes + stay active) ───

export async function sendCloseRaceAlert(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  rank: number,
  nextRank: number,
  votesGap: number,
  daysLeft: number,
) {
  const url = appUrl();
  const suggestedPkg = VOTE_PACKAGES.find((p) => p.votes >= votesGap) ?? VOTE_PACKAGES[0];
  const pkgLabel = `${suggestedPkg.votes} votes for $${(suggestedPkg.price / 100).toFixed(2)}`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `⚡ ${petName} is only ${votesGap} vote${votesGap !== 1 ? "s" : ""} from #${nextRank}!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px;">Close Race Alert</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">Just ${votesGap} vote${votesGap !== 1 ? "s" : ""} to move up! ⚡</h1>
      ${statRow([
        { label: "Current Rank", value: `#${rank}` },
        { label: "Next Rank", value: `#${nextRank}` },
        { label: "Votes Needed", value: String(votesGap) },
      ])}
      ${infoBox(`<strong>${petName}</strong> is neck-and-neck with the pet ranked #${nextRank} in <strong>${contestName}</strong>. Just <strong>${votesGap} more vote${votesGap !== 1 ? "s" : ""}</strong> and you move up! ${daysLeft <= 2 ? "The contest ends soon — act now!" : "This is your moment!"}`, "#fffbeb", "#fde68a")}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;border:1px solid #c7d2fe;border-radius:12px;overflow:hidden;background:#eef2ff;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:0.5px;">💡 Quick Math</p>
            <p style="margin:0;font-size:15px;color:#312e81;line-height:1.6;">The <strong>${suggestedPkg.label}</strong> package (${pkgLabel}) would move ${petName} up to <strong>#${nextRank}</strong> — and every vote feeds a shelter pet.</p>
          </td>
        </tr>
      </table>
      ${ctaButton("Buy Votes & Move Up", `${url}/dashboard#votes`, "#d97706")}
      ${ctaButton("Share & Get Free Votes", `${url}/contests/${contestId}`, "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Paid votes do double duty — help ${petName} win AND feed shelter animals.</p>
    `, `${petName} is only ${votesGap} votes from #${nextRank} in ${contestName}!`),
  });
}

export async function sendNoVotesNudge(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  rank: number,
  totalVotes: number,
  daysLeft: number,
) {
  const url = appUrl();

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `😟 ${petName} hasn't gotten any votes today`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">Heads Up</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${petName} needs some love today 😟</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">Hey ${userName}, <strong>${petName}</strong> hasn't received any new votes today in <strong>${contestName}</strong>. Meanwhile, other pets are climbing the ranks.</p>
      ${statRow([
        { label: "Current Rank", value: `#${rank}` },
        { label: "Total Votes", value: String(totalVotes) },
        { label: "Days Left", value: daysLeft > 0 ? `${daysLeft}d` : "Final day!" },
      ])}
      ${infoBox(`<strong>Don't let ${petName} fall behind!</strong> Here are 3 things you can do right now:<br/><br/>1. <strong>Share the contest link</strong> on social media or text it to 5 friends<br/>2. <strong>Buy a small vote pack</strong> — even 5 votes for $0.99 helps<br/>3. <strong>Use your free votes</strong> if you haven't already today`, "#fef2f2", "#fca5a5")}
      ${ctaButton("Vote & Share Now", `${url}/contests/${contestId}`)}
      ${ctaButton("Buy a Quick Boost — $0.99", `${url}/dashboard#votes`, "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Every vote — free or paid — feeds a shelter pet. You're making a difference either way!</p>
    `, `${petName} has 0 votes today in ${contestName} — help them out!`),
  });
}

export async function sendFinalHoursPush(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  rank: number,
  votesNeededForTop3: number,
  prizeDescription?: string | null,
) {
  const url = appUrl();
  const isTop3 = votesNeededForTop3 <= 0;
  const suggestedPkg = !isTop3 && votesNeededForTop3 > 0
    ? VOTE_PACKAGES.find((p) => p.votes >= votesNeededForTop3) ?? VOTE_PACKAGES[VOTE_PACKAGES.length - 1]
    : VOTE_PACKAGES[0];

  const prizeSection = prizeDescription
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;border:1px solid #fde68a;border-radius:12px;overflow:hidden;background:#fffbeb;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.5px;">🎁 On The Line</p>
            <p style="margin:0;font-size:15px;color:#78350f;line-height:1.6;">${prizeDescription}</p>
          </td>
        </tr>
      </table>`
    : "";

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `⏰ Last chance — ${contestName} ends tomorrow`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">🚨 Final Hours</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">This is it — last chance<br/>for ${petName}!</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">Hey ${userName}, <strong>${contestName}</strong> ends <strong>tomorrow</strong>. ${petName} is currently ranked <strong>#${rank}</strong>.</p>
      ${statRow([
        { label: "Current Rank", value: `#${rank}` },
        { label: isTop3 ? "Status" : "To Top 3", value: isTop3 ? "Winning!" : `${votesNeededForTop3} votes` },
        { label: "Time Left", value: "~24h" },
      ])}
      ${isTop3
        ? infoBox(`🏆 <strong>${petName} is in a winning position!</strong> Don't get complacent — the final hours see the biggest swings. Buy a few extra votes to lock it in.`, "#f0fdf4", "#86efac")
        : infoBox(`<strong>${petName} needs ${votesNeededForTop3} more votes to crack the top 3.</strong> That's just the <strong>${suggestedPkg.label}</strong> pack (${suggestedPkg.votes} votes for $${(suggestedPkg.price / 100).toFixed(2)}). Tomorrow it'll be too late.`, "#fef2f2", "#fca5a5")}
      ${prizeSection}
      ${ctaButton(isTop3 ? "Lock In the Win — Buy Votes" : "Buy Votes Now — Last Chance", `${url}/dashboard#votes`, "#dc2626")}
      ${ctaButton("Share the Link One More Time", `${url}/contests/${contestId}`, "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Win or not, every vote you've cast has helped feed shelter pets. Thank you! ❤️</p>
    `, `${contestName} ends tomorrow — ${petName} is #${rank}. ${isTop3 ? "Lock in your win!" : `${votesNeededForTop3} votes from top 3!`}`),
  });
}

export async function sendContestReEntry(
  to: string,
  userName: string,
  petName: string,
  oldContestName: string,
  newContestName: string,
  newContestId: string,
  reEntryToken: string,
  applicationUrl: string
) {
  const reentryUrl = `${applicationUrl}/api/contests/reenter?token=${encodeURIComponent(reEntryToken)}`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `🐾 ${petName} was so close — let's run it back`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">New Contest Available</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${petName} was so close...<br/>Time for round 2! 🐾</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">Hey ${userName}, ${petName} made a strong run in <strong>${oldContestName}</strong>. Now there's a new shot in <strong>${newContestName}</strong>.</p>
      ${infoBox(`Your re-entry link will <strong>auto-fill everything</strong> — one click and ${petName} is back in the running. You can update the photo afterward.`)}
      ${ctaButton(`Re-Enter ${petName} →`, reentryUrl)}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Each new round means more chances to win while helping shelter pets in need.</p>
      <p style="margin-top:16px;font-size:12px;color:#a1a1aa;">Button not working? Copy this link into your browser:<br/><span style="color:#71717a;">${reentryUrl}</span></p>
    `, `${petName} has a spot in ${newContestName} — one click to enter!`),
  });
}

export async function sendAlmostWonEmail(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  rank: number,
  votesFromTop3: number,
  nextContestId: string,
) {
  const rSuffix = rankSuffix(rank);
  const bestPkg = VOTE_PACKAGES.find(p => p.votes >= votesFromTop3) ?? VOTE_PACKAGES[VOTE_PACKAGES.length - 1];
  const suggestedPkg = `${bestPkg.votes} votes for $${(bestPkg.price / 100).toFixed(2)}`;
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `😢 ${petName} was so close — finished ${rSuffix}, only ${votesFromTop3} votes from top 3`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">So Close!</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${petName} finished ${rSuffix} 😢<br/>Just ${votesFromTop3} vote${votesFromTop3 !== 1 ? "s" : ""} from winning!</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">Hey ${userName}, <strong>${petName}</strong> was <strong>only ${votesFromTop3} vote${votesFromTop3 !== 1 ? "s" : ""} away</strong> from cracking the top 3 in <strong>${contestName}</strong>. That's heartbreakingly close.</p>
      ${statRow([{ label: "Final Rank", value: `#${rank}` }, { label: "Votes Short", value: String(votesFromTop3) }, { label: "Next Contest", value: "LIVE NOW" }])}
      ${infoBox(`💡 <strong>Don't let it happen again.</strong> A quick boost of ${suggestedPkg} would have changed everything. Start the next contest with an advantage.`, "#fef2f2", "#fca5a5")}
      ${ctaButton("Enter Next Contest — Win This Time", `${appUrl()}/contests/${nextContestId}`)}
      ${ctaButton("Buy Votes Now", `${appUrl()}/dashboard#votes`, "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Every vote purchase feeds shelter pets — your support matters win or lose.</p>
    `, `${petName} was ${rSuffix} — only ${votesFromTop3} votes from Top 3. Next contest is live!`),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: "Reset your VoteToFeed password",
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Password Reset</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">Reset your<br/>password 🔐</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">We received a request to reset your VoteToFeed password. Click the button below to choose a new one.</p>
      ${infoBox(`⏰ <strong>This link expires in 1 hour.</strong> If you didn't request a password reset, you can safely ignore this email.`, "#fef2f2", "#fca5a5")}
      ${ctaButton("Reset My Password", resetUrl)}
      <p style="margin-top:20px;font-size:12px;color:#a1a1aa;">Button not working? Copy this URL into your browser:<br/><span style="color:#71717a;word-break:break-all;">${resetUrl}</span></p>
    `, "Click the link to reset your VoteToFeed password — expires in 1 hour."),
  }, { transactional: true });
}

export async function sendContestWinner(
  to: string,
  petName: string,
  contestName: string,
  placement: number,
  prizeTitle: string,
  prizeItems: string[],
  prizeValue: number
) {
  const isRandom = placement === 0;
  const subject = isRandom
    ? `🎉 ${petName} was selected as our Random Winner!`
    : placement === 1
      ? `🏆 ${petName} WON 1st Place — $${(prizeValue / 100).toFixed(0)} Prize Pack!`
      : `🎉 ${petName} won ${rankSuffix(placement)} place in ${contestName}!`;

  const placementLabel = isRandom ? "Random Winner 🎲" : `${rankSuffix(placement)} Place ${placement === 1 ? "🥇" : placement === 2 ? "🥈" : "🥉"}`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;">${isRandom ? "You Won!" : "Contest Winner"}</p>
      <h1 style="margin:0 0 20px;font-size:30px;font-weight:900;color:#18181b;line-height:1.2;">${isRandom ? "🎲 Lucky you!" : "🏆 Congratulations!"}<br/>${petName} won ${placementLabel}!</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">${petName} placed in <strong>${contestName}</strong> and earned the <strong>${prizeTitle}</strong>.</p>
      ${statRow([{ label: "Prize Value", value: `$${(prizeValue / 100).toFixed(0)}` }, { label: "Placement", value: placementLabel }])}
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#18181b;">Your prize pack includes:</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;">
        ${prizeItems.map(item => `<tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:15px;color:#3f3f46;">✅ &nbsp;${item}</td></tr>`).join("")}
      </table>
      ${infoBox(`📦 We'll follow up with fulfillment details within <strong>2 business days</strong>. Expect delivery in <strong>2–4 weeks</strong>.`, "#fff7ed", "#fdba74")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Thanks for helping turn contest energy into real support for shelter pets.</p>
    `, `${petName} won ${placementLabel} in ${contestName} — $${(prizeValue / 100).toFixed(0)} prize!`),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMENT NOTIFICATION — sent to pet owner when someone comments on their pet
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCommentNotification(
  to: string,
  petOwnerName: string,
  petName: string,
  petId: string,
  commenterName: string,
  commentText: string,
  isReply: boolean
) {
  const petUrl = `${appUrl()}/pets/${petId}`;
  const subject = isReply
    ? `💬 ${commenterName} replied to a comment on ${petName}`
    : `💬 ${commenterName} commented on ${petName}`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;">${isReply ? "New Reply" : "New Comment"}</p>
      <h1 style="margin:0 0 20px;font-size:26px;font-weight:900;color:#18181b;line-height:1.2;">${commenterName} ${isReply ? "replied on" : "commented on"}<br/>${petName}! 💬</h1>
      <p style="margin:0 0 16px;color:#52525b;font-size:15px;">Hey ${petOwnerName}, here's what they wrote:</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
        <tr>
          <td style="background:#faf5ff;border-left:4px solid #a855f7;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#7c3aed;">${commenterName}</p>
            <p style="margin:0;font-size:16px;color:#18181b;line-height:1.6;">"${commentText}"</p>
          </td>
        </tr>
      </table>
      ${ctaButton("View & Reply", petUrl, "#7c3aed")}
      <p style="margin-top:20px;font-size:13px;color:#a1a1aa;">You can manage comment notifications in your account settings.</p>
    `, `${commenterName} ${isReply ? "replied on" : "left a comment on"} ${petName}`),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLY NOTIFICATION — sent to the original commenter when someone replies
// ─────────────────────────────────────────────────────────────────────────────
export async function sendReplyNotification(
  to: string,
  recipientName: string,
  petName: string,
  petId: string,
  replierName: string,
  originalText: string,
  replyText: string
) {
  const petUrl = `${appUrl()}/pets/${petId}`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `💬 ${replierName} replied to your comment on ${petName}`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;">New Reply</p>
      <h1 style="margin:0 0 20px;font-size:26px;font-weight:900;color:#18181b;line-height:1.2;">${replierName} replied to your comment! 💬</h1>
      <p style="margin:0 0 16px;color:#52525b;font-size:15px;">Hey ${recipientName}, someone replied to what you wrote on <strong>${petName}</strong>:</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 12px;">
        <tr>
          <td style="background:#f4f4f5;border-left:4px solid #d4d4d8;border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Your comment</p>
            <p style="margin:0;font-size:14px;color:#52525b;line-height:1.5;">"${originalText}"</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
        <tr>
          <td style="background:#faf5ff;border-left:4px solid #a855f7;border-radius:0 8px 8px 0;padding:14px 18px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">${replierName} replied</p>
            <p style="margin:0;font-size:16px;color:#18181b;line-height:1.6;">"${replyText}"</p>
          </td>
        </tr>
      </table>
      ${ctaButton("View Conversation", petUrl, "#7c3aed")}
      <p style="margin-top:20px;font-size:13px;color:#a1a1aa;">You can manage comment notifications in your account settings.</p>
    `, `${replierName} replied to your comment on ${petName}`),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCHED VOTE ALERT — sent when cooldown expires (shows total accumulated votes)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBatchedVoteAlert(
  to: string,
  petOwnerName: string,
  petName: string,
  petId: string,
  newVoteCount: number,
  totalWeeklyVotes: number,
  rank: number | null
) {
  const petUrl = `${appUrl()}/pets/${petId}`;
  const subject = newVoteCount === 1
    ? `🐾 ${petName} just got a new vote!`
    : `🐾 ${petName} got ${newVoteCount} new votes!`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Vote Update</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">
        ${newVoteCount === 1 ? `New vote for` : `${newVoteCount} new votes for`}<br/>${petName}! 🐾
      </h1>
      ${statRow([
        { label: newVoteCount === 1 ? "New Vote" : "New Votes", value: String(newVoteCount) },
        { label: "Total This Week", value: String(totalWeeklyVotes) },
        ...(rank ? [{ label: "Current Rank", value: `#${rank}` }] : []),
      ])}
      ${infoBox("🌟 <strong>Share " + petName + "'s profile</strong> to keep the votes rolling in! Every vote helps feed a shelter pet. 🐾")}
      ${ctaButton(`View ${petName}'s Profile`, petUrl)}
    `, `${newVoteCount === 1 ? `1 new vote` : `${newVoteCount} new votes`} for ${petName} — ${totalWeeklyVotes} total this week!`),
  });
}

export async function sendFollowNotification(
  to: string,
  recipientName: string,
  followerName: string,
  followerImage: string | null,
  profileUrl: string,
) {
  const initial = followerName[0]?.toUpperCase() || "?";
  const avatarHtml = followerImage
    ? `<img src="${followerImage}" width="48" height="48" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #fca5a5;" alt="${followerName}" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;text-align:center;line-height:48px;">${initial}</div>`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `👋 ${followerName} started following you on VoteToFeed`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">New Follower</p>
      <h1 style="margin:0 0 20px;font-size:26px;font-weight:900;color:#18181b;line-height:1.2;">You have a new follower! 🎉</h1>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;">
        <tr>
          <td style="vertical-align:middle;padding-right:16px;">${avatarHtml}</td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-size:17px;font-weight:800;color:#18181b;">${followerName}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#71717a;">is now following you</p>
          </td>
        </tr>
      </table>
      ${infoBox(`Hi <strong>${recipientName}</strong>, <strong>${followerName}</strong> just started following you. They'll see your posts and activity on VoteToFeed.`)}
      ${ctaButton("View Their Profile", profileUrl)}
    `, `${followerName} started following you on VoteToFeed`),
  });
}

export async function sendPostLikeNotification(
  to: string,
  recipientName: string,
  likerName: string,
  postPreview: string,
  profileUrl: string,
) {
  const preview = postPreview.length > 100 ? postPreview.slice(0, 100) + "…" : postPreview;
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `❤️ ${likerName} liked your post`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Post Like</p>
      <h1 style="margin:0 0 20px;font-size:26px;font-weight:900;color:#18181b;line-height:1.2;">Someone liked your post! ❤️</h1>
      ${infoBox(`<strong>${likerName}</strong> liked your post:<br/><em style="color:#52525b;">"${preview}"</em>`)}
      ${ctaButton("View Your Profile", profileUrl)}
    `, `${likerName} liked your post on VoteToFeed`),
  });
}

export async function sendPostCommentNotification(
  to: string,
  recipientName: string,
  commenterName: string,
  commentText: string,
  postPreview: string,
  profileUrl: string,
) {
  const preview = postPreview.length > 80 ? postPreview.slice(0, 80) + "…" : postPreview;
  const comment = commentText.length > 120 ? commentText.slice(0, 120) + "…" : commentText;
  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `💬 ${commenterName} commented on your post`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">New Comment</p>
      <h1 style="margin:0 0 20px;font-size:26px;font-weight:900;color:#18181b;line-height:1.2;">New comment on your post 💬</h1>
      ${infoBox(`<strong>${commenterName}</strong> commented on your post "<em>${preview}</em>":<br/><br/><span style="font-size:15px;color:#18181b;">"${comment}"</span>`)}
      ${ctaButton("View Your Profile", profileUrl)}
    `, `${commenterName} commented on your post`),
  });
}

export async function sendNominationEmail(
  to: string,
  recipientName: string,
  contestName: string,
  petType: string,
  endDate: Date,
  petName?: string,
) {
  const url = appUrl();
  const signupUrl = `${url}/auth/signup?utm_source=nomination&utm_medium=email`;
  const daysLeft = Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const petTypeLabel = petType === "DOG" ? "dog" : petType === "CAT" ? "cat" : "pet";
  const petDisplay = petName || `your ${petTypeLabel}`;

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `🏆 ${petDisplay} has been nominated for ${contestName}!`,
    html: nominationEmailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">You're Nominated!</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">🏆 Hey ${recipientName}!</h1>
      ${infoBox(`<strong>${petDisplay}</strong> has been nominated to compete in the <strong>${contestName}</strong>! This is a free contest where ${petTypeLabel} owners enter their pets to win prizes — and every vote helps feed shelter animals.`)}
      <p style="font-size:15px;color:#52525b;line-height:1.7;">
        Here's how it works:<br/>
        <strong>1.</strong> Sign up free (takes 30 seconds)<br/>
        <strong>2.</strong> Upload a photo of ${petDisplay}<br/>
        <strong>3.</strong> Share with friends & family to get votes<br/>
        <strong>4.</strong> Win prizes — and feed shelter pets with every vote 🐾
      </p>
      ${statRow([
        { label: "Contest", value: contestName.length > 18 ? contestName.slice(0, 18) + "…" : contestName },
        { label: "Time Left", value: daysLeft > 0 ? `${daysLeft}d` : "Ending soon" },
        { label: "Entry Fee", value: "Free" },
      ])}
      ${ctaButton("Sign Up & Enter Now", signupUrl)}
      <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;text-align:center;">Spots fill up fast — don't miss out!</p>
    `, `${petDisplay} has been nominated for ${contestName} on VoteToFeed!`),
  });
}

/**
 * Notification email when an admin auto-adds a pet to a contest.
 * Not asking permission — just informing them they're in!
 */
export async function sendContestAddedEmail(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  daysLeft: number,
  prizeDescription?: string | null,
) {
  const url = appUrl();

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `🎉 ${petName} is now competing in ${contestName}!`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">You're In!</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">🎉 ${petName} is in the contest!</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">Hey ${userName}, great news — <strong>${petName}</strong> has been entered into <strong>${contestName}</strong>!</p>
      ${statRow([
        { label: "Contest", value: contestName.length > 18 ? contestName.slice(0, 18) + "…" : contestName },
        { label: "Time Left", value: daysLeft > 0 ? `${daysLeft}d` : "Starting soon" },
        { label: "Entry Fee", value: "Free" },
      ])}
      ${prizeDescription ? infoBox(`<strong>🎁 Prizes:</strong> ${prizeDescription}`) : ""}
      ${infoBox(`<strong>What to do now:</strong><br/><br/>1. <strong>Share your contest link</strong> with friends &amp; family<br/>2. <strong>Vote for ${petName}</strong> every day (free votes!)<br/>3. <strong>Climb the ranks</strong> — every vote also feeds shelter pets 🐾`)}
      ${ctaButton("See " + petName + "'s Contest Page", `${url}/contests/${contestId}`)}
      ${ctaButton("Buy Extra Votes — Jump the Ranks", `${url}/dashboard#votes`, "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;text-align:center;">🐾 Every vote feeds shelter pets — win or not, you're making a difference.</p>
    `, `${petName} is now competing in ${contestName} on VoteToFeed!`),
  });
}

export async function sendWelcomeEmail(to: string, firstName: string) {
  const url = appUrl();
  const starterPkg = VOTE_PACKAGES[0];

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject: `Welcome to VoteToFeed, ${firstName}! 🐾`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">You're In!</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">Welcome, ${firstName}! 🎉<br/>Let's get your pet in the game.</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">VoteToFeed is a pet voting contest where every vote you cast <strong>feeds a shelter pet</strong>. Here's how to get started in 3 steps:</p>
      ${infoBox(`
        <strong>Step 1 — Add your pet</strong> (takes 30 seconds)<br/>
        Upload a photo and a short bio. That's it.<br/><br/>
        <strong>Step 2 — Enter a free contest</strong><br/>
        Enter your pet into an active contest for free. You're competing for prizes immediately.<br/><br/>
        <strong>Step 3 — Get votes &amp; climb the ranks</strong><br/>
        Share your contest link, cast free daily votes, or buy a vote pack to jump the leaderboard.
      `, "#f0fdf4", "#86efac")}
      ${statRow([
        { label: "Starter Pack", value: `$${(starterPkg.price / 100).toFixed(2)}` },
        { label: "Votes", value: String(starterPkg.votes) },
        { label: "Meals donated", value: "5+" },
      ])}
      ${ctaButton("Add My Pet Now", `${url}/pets/new`)}
      ${ctaButton("Browse Active Contests", `${url}/contests`, "#71717a")}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Even your free daily votes help feed shelter animals. Thank you for joining!</p>
    `, `Welcome to VoteToFeed — add your pet, enter a contest, and start climbing the ranks!`),
    headers: {},
  });
}

export async function sendNewUserNudge(
  to: string,
  firstName: string,
  petName: string | null,
  contestId: string | null,
) {
  const url = appUrl();
  const starterPkg = VOTE_PACKAGES[0];
  const hasPet = Boolean(petName && contestId);

  const subject = hasPet
    ? `${firstName}, ${petName} needs your first boost! 🐾`
    : `${firstName}, your pet is waiting — enter a contest today! 🐾`;

  const headline = hasPet
    ? `${petName} is in the game — give them their first real boost!`
    : `Your account is ready — now let's win something!`;

  const bodyText = hasPet
    ? `Hey ${firstName}, <strong>${petName}</strong> is entered and competing right now. Other pets are getting vote boosts from their owners. Even a small pack of ${starterPkg.votes} votes for $${(starterPkg.price / 100).toFixed(2)} can move ${petName} up several spots on the leaderboard.`
    : `Hey ${firstName}, you signed up but haven't added a pet yet — and there are active contests running right now with real prizes. It takes 30 seconds to add your pet and enter for free.`;

  const primaryCta = hasPet
    ? ctaButton(`Boost ${petName} — ${starterPkg.votes} votes for $${(starterPkg.price / 100).toFixed(2)}`, `${url}/dashboard#votes`)
    : ctaButton("Add My Pet & Enter Free", `${url}/pets/new`);

  const secondaryCta = hasPet
    ? ctaButton("See the Leaderboard", `${url}/contests/${contestId}`, "#71717a")
    : ctaButton("Browse Active Contests", `${url}/contests`, "#71717a");

  await sendEmail({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">Quick Reminder</p>
      <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;color:#18181b;line-height:1.2;">${headline}</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:16px;">${bodyText}</p>
      ${infoBox(`<strong>Why buy votes?</strong><br/><br/>• Jump the leaderboard instantly<br/>• Every paid vote donates a meal to a shelter pet 🐾<br/>• Top 3 winners get real prizes<br/>• Cheapest pack: just $${(starterPkg.price / 100).toFixed(2)} for ${starterPkg.votes} votes`)}
      ${primaryCta}
      ${secondaryCta}
      <p style="margin-top:20px;font-size:14px;color:#16a34a;">🐾 Every vote — free or paid — makes a difference. Thank you for being here!</p>
    `, hasPet ? `${petName} needs votes — even a small boost helps them climb!` : `You're one step away — add your pet and enter a free contest!`),
    headers: {},
  });
}
