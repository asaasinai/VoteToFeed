import { Resend } from "resend";
import prisma from "./prisma";

let resendClient: Resend | null = null;

async function getResendApiKey(): Promise<string> {
  const setting = await prisma.adminSetting.findUnique({
    where: { key: "resend_api_key" },
  });
  return setting?.value || process.env.RESEND_API_KEY || "";
}

async function getFromEmail(): Promise<string> {
  const setting = await prisma.adminSetting.findUnique({
    where: { key: "resend_from_email" },
  });
  return (
    setting?.value ||
    process.env.RESEND_FROM_EMAIL ||
    "Vote to Feed <noreply@votetofeed.com>"
  );
}

async function getResend(): Promise<Resend | null> {
  const apiKey = await getResendApiKey();
  if (!apiKey) return null;
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function resetResendClient() {
  resendClient = null;
}

async function getEmailTemplate(
  type: string
): Promise<{ subject: string; body: string; enabled: boolean } | null> {
  const template = await prisma.emailTemplate.findUnique({ where: { type } });
  if (!template) return null;
  return { subject: template.subject, body: template.body, enabled: template.enabled };
}

function interpolate(
  template: string,
  vars: Record<string, string | number>
): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), String(val));
  }
  return result;
}

function wrapInLayout(bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #EF4444, #F97316); padding: 24px; text-align: center;">
        <h1 style="color: white; font-size: 24px; margin: 0;">❤️ Vote to Feed</h1>
        <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 6px 0 0;">Every vote helps feed shelter pets</p>
      </div>
      <div style="padding: 32px 24px;">
        ${bodyHtml}
      </div>
      <div style="background: #F9FAFB; padding: 20px 24px; border-top: 1px solid #E5E7EB; text-align: center;">
        <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
          Vote to Feed — Powered by iHeartDogs &amp; iHeartCats
        </p>
        <p style="color: #9CA3AF; font-size: 11px; margin: 4px 0 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com"}" style="color: #6B7280;">Visit Site</a>
        </p>
      </div>
    </div>
  `;
}

async function sendEmail(to: string, subject: string, html: string) {
  const resend = await getResend();
  if (!resend) {
    console.warn("[Email] Resend not configured, skipping email to", to);
    return;
  }
  const from = await getFromEmail();
  try {
    await resend.emails.send({ from, to, subject, html });
  } catch (err) {
    console.error("[Email] Failed to send:", err);
  }
}

// ─── EMAIL TOUCHPOINT FUNCTIONS ────────────────────────

export async function sendWelcomeEmail(
  to: string,
  userName: string,
  activeContestCount: number
) {
  const template = await getEmailTemplate("WELCOME");
  const vars = {
    userName,
    activeContestCount,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
  };

  const defaultSubject = "Welcome to Vote to Feed! 🐾";
  const defaultBody = `
    <h2 style="color: #1F2937; margin: 0 0 8px;">Welcome, {{userName}}! 🎉</h2>
    <p style="color: #4B5563; line-height: 1.6;">Thanks for joining Vote to Feed — the pet photo contest where every vote helps feed shelter pets in need.</p>

    <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #92400E; margin: 0 0 12px;">🐾 How it works:</h3>
      <ol style="color: #78350F; padding-left: 20px; margin: 0; line-height: 1.8;">
        <li><strong>Add your pet</strong> — Upload photos and enter active contests for free</li>
        <li><strong>Collect votes</strong> — Share with friends and family to climb the leaderboard</li>
        <li><strong>Win prizes</strong> — Top pets win prize packs worth up to $2,000</li>
        <li><strong>Feed shelters</strong> — Every vote purchased helps feed shelter pets</li>
      </ol>
    </div>

    <p style="color: #4B5563;">There are currently <strong>{{activeContestCount}} active contests</strong> you can enter!</p>

    <div style="margin: 24px 0;">
      <a href="{{appUrl}}/pets/new" style="display: inline-block; padding: 14px 28px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">Add Your Pet — Free</a>
    </div>

    <div style="background: #F9FAFB; border-radius: 12px; padding: 16px; margin-top: 20px;">
      <h4 style="color: #374151; margin: 0 0 8px;">📱 Managing your account:</h4>
      <ul style="color: #6B7280; padding-left: 16px; margin: 0; line-height: 1.8; font-size: 14px;">
        <li>Visit your <a href="{{appUrl}}/dashboard" style="color: #EF4444;">Dashboard</a> to manage pets, votes, and purchases</li>
        <li>You receive <strong>5 free votes per week</strong> — use them on your favorites!</li>
        <li>Adjust your email notification preferences in your dashboard settings</li>
      </ul>
    </div>
  `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

export async function sendVoteReceivedEmail(
  to: string,
  petName: string,
  petId: string,
  voterName: string,
  voteCount: number,
  rank: number | null,
  isPaidVote: boolean
) {
  const prefs = await getUserPrefs(to);
  if (prefs && !prefs.voteAlerts) return;

  const template = await getEmailTemplate("VOTE_RECEIVED");
  const vars = {
    petName,
    voterName,
    voteCount,
    rank: rank ? `#${rank}` : "—",
    voteType: isPaidVote ? "paid" : "free",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
    petId,
  };

  const defaultSubject = "🐾 {{petName}} got a vote!";
  const defaultBody = `
    <h2 style="color: #1F2937; margin: 0 0 8px;">New vote for {{petName}}! 🎉</h2>
    <p style="color: #4B5563; line-height: 1.6;"><strong>{{voterName}}</strong> just cast a {{voteType}} vote for {{petName}}.</p>
    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
      <p style="color: #166534; font-size: 32px; font-weight: 700; margin: 0;">{{voteCount}}</p>
      <p style="color: #15803D; font-size: 14px; margin: 4px 0 0;">total votes this week</p>
      <p style="color: #16A34A; font-size: 13px; margin: 4px 0 0;">Current rank: {{rank}}</p>
    </div>
    <div style="margin: 20px 0;">
      <a href="{{appUrl}}/pets/{{petId}}" style="display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">View {{petName}}'s Profile</a>
    </div>
  `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

export async function sendCommentReceivedEmail(
  to: string,
  petName: string,
  petId: string,
  commenterName: string,
  commentText: string
) {
  const prefs = await getUserPrefs(to);
  if (prefs && !prefs.commentAlerts) return;

  const template = await getEmailTemplate("COMMENT_RECEIVED");
  const vars = {
    petName,
    commenterName,
    commentText,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
    petId,
  };

  const defaultSubject = "💬 New comment on {{petName}}'s profile";
  const defaultBody = `
    <h2 style="color: #1F2937; margin: 0 0 8px;">New comment on {{petName}}! 💬</h2>
    <p style="color: #4B5563;"><strong>{{commenterName}}</strong> left a comment:</p>
    <div style="background: #F9FAFB; border-left: 4px solid #EF4444; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
      <p style="color: #374151; font-style: italic; margin: 0;">"{{commentText}}"</p>
    </div>
    <a href="{{appUrl}}/pets/{{petId}}" style="display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">View Comment</a>
  `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

export async function sendPurchaseConfirmationEmail(
  to: string,
  votes: number,
  amount: number,
  mealsProvided: number,
  animalType: string
) {
  const template = await getEmailTemplate("PURCHASE_CONFIRMATION");
  const vars = {
    votes,
    amount: (amount / 100).toFixed(2),
    mealsProvided: Math.round(mealsProvided),
    animalType,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
  };

  const defaultSubject = "✅ {{votes}} Votes Added — Thank You!";
  const defaultBody = `
    <h2 style="color: #1F2937; margin: 0 0 8px;">Purchase confirmed! ✅</h2>
    <p style="color: #4B5563;">Thank you for your purchase of <strong>$\{{amount}}</strong>.</p>
    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
      <p style="color: #166534; font-size: 36px; font-weight: 700; margin: 0;">{{votes}}</p>
      <p style="color: #15803D; font-size: 14px; margin: 4px 0 0;">votes added to your account</p>
    </div>
    <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: center;">
      <p style="color: #92400E; font-size: 20px; font-weight: 700; margin: 0;">🐾 ~{{mealsProvided}} shelter {{animalType}} fed</p>
      <p style="color: #B45309; font-size: 13px; margin: 4px 0 0;">Your purchase makes a real difference!</p>
    </div>
    <a href="{{appUrl}}" style="display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">Start Voting</a>
  `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

export async function sendFreeVotesAddedEmail(
  to: string,
  userName: string,
  freeVotes: number,
  animalType: string
) {
  const prefs = await getUserPrefs(to);
  if (prefs && !prefs.freeVoteReminder) return;

  const template = await getEmailTemplate("FREE_VOTES_ADDED");
  const vars = {
    userName,
    freeVotes,
    animalType,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
  };

  const defaultSubject = "🎉 Your {{freeVotes}} free votes are ready!";
  const defaultBody = `
    <h2 style="color: #1F2937; margin: 0 0 8px;">Free votes refreshed! 🎉</h2>
    <p style="color: #4B5563;">Hey {{userName}}, your <strong>{{freeVotes}} free votes</strong> have been added to your account.</p>
    <p style="color: #4B5563;">Use them to vote for your favorite pets and help feed shelter {{animalType}}!</p>
    <div style="margin: 20px 0;">
      <a href="{{appUrl}}" style="display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">Cast Your Free Votes</a>
    </div>
  `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

export async function sendContestClosingEmail(
  to: string,
  userName: string,
  contestName: string,
  daysLeft: number,
  petName: string,
  petId: string,
  currentRank: number | null
) {
  const prefs = await getUserPrefs(to);
  if (prefs && !prefs.contestAlerts) return;

  const template = await getEmailTemplate("CONTEST_CLOSING");
  const vars = {
    userName,
    contestName,
    daysLeft,
    petName,
    petId,
    currentRank: currentRank ? `#${currentRank}` : "unranked",
    urgency:
      daysLeft <= 1
        ? "🚨 LAST CHANCE"
        : daysLeft <= 2
          ? "⏰ Almost over"
          : "📅 Closing soon",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
  };

  const defaultSubject =
    "{{urgency}} — {{contestName}} ends in {{daysLeft}} day(s)!";
  const defaultBody = `
    <h2 style="color: #1F2937; margin: 0 0 8px;">{{urgency}}: {{contestName}}</h2>
    <p style="color: #4B5563;">Hey {{userName}}, the <strong>{{contestName}}</strong> ends in <strong>{{daysLeft}} day(s)</strong>!</p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 20px; margin: 16px 0;">
      <p style="color: #991B1B; font-size: 16px; font-weight: 600; margin: 0;">{{petName}} is currently ranked {{currentRank}}</p>
      <p style="color: #B91C1C; margin: 8px 0 0;">Share with friends to boost your rank before time runs out!</p>
    </div>
    <div style="margin: 16px 0;">
      <p style="color: #374151; font-weight: 600; margin-bottom: 12px;">📱 Share {{petName}}'s page:</p>
      <a href="{{appUrl}}/pets/{{petId}}" style="display: inline-block; padding: 10px 20px; background: #1877F2; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 8px;">Share on Facebook</a>
      <a href="{{appUrl}}/pets/{{petId}}" style="display: inline-block; padding: 10px 20px; background: #1DA1F2; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Share on Twitter</a>
    </div>
    <a href="{{appUrl}}/pets/{{petId}}" style="display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin-top: 8px;">View {{petName}}'s Profile</a>
  `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

export async function sendContestResultEmail(
  to: string,
  petName: string,
  contestName: string,
  placement: number | null,
  prizeValue: number | null,
  prizeItems: string[],
  isWinner: boolean
) {
  const template = await getEmailTemplate("CONTEST_RESULT");
  const vars = {
    petName,
    contestName,
    placement: placement ? `#${placement}` : "",
    prizeValue: prizeValue ? `$${(prizeValue / 100).toLocaleString()}` : "",
    prizeItemsList: prizeItems.length
      ? prizeItems.map((i) => `<li>${i}</li>`).join("")
      : "",
    isWinner: isWinner ? "true" : "false",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com",
  };

  const defaultSubject = isWinner
    ? "🏆 {{petName}} won {{placement}} in {{contestName}}!"
    : "{{contestName}} has ended — Thank you for participating!";

  const defaultBody = isWinner
    ? `
      <h2 style="color: #1F2937; margin: 0 0 8px;">🏆 Congratulations! {{petName}} won {{placement}}!</h2>
      <p style="color: #4B5563;">Amazing news — <strong>{{petName}}</strong> finished <strong>{{placement}}</strong> in the <strong>{{contestName}}</strong>!</p>
      <div style="background: #FFFBEB; border: 2px solid #F59E0B; border-radius: 12px; padding: 24px; margin: 16px 0; text-align: center;">
        <p style="color: #92400E; font-size: 28px; font-weight: 700; margin: 0;">Prize: {{prizeValue}}</p>
        <ul style="color: #78350F; text-align: left; padding-left: 20px; margin: 12px 0;">{{prizeItemsList}}</ul>
      </div>
      <p style="color: #4B5563;">We'll send fulfillment details separately. Expect delivery within 2–4 weeks.</p>
    `
    : `
      <h2 style="color: #1F2937; margin: 0 0 8px;">Thanks for participating! 🐾</h2>
      <p style="color: #4B5563;">The <strong>{{contestName}}</strong> has ended. {{petName}} didn't place in the top 3 this time, but we appreciate your participation!</p>
      <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
        <p style="color: #166534; font-size: 16px; font-weight: 600; margin: 0;">🎁 Special thank you gift incoming!</p>
        <p style="color: #15803D; font-size: 13px; margin: 4px 0 0;">Check your dashboard for a surprise from us.</p>
      </div>
      <p style="color: #4B5563;">New contests start every week — enter again for another chance to win!</p>
      <a href="{{appUrl}}/contests" style="display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin-top: 8px;">View Active Contests</a>
    `;

  const subject = template?.subject
    ? interpolate(template.subject, vars)
    : interpolate(defaultSubject, vars);
  const body = template?.body
    ? interpolate(template.body, vars)
    : interpolate(defaultBody, vars);

  if (template && !template.enabled) return;

  await sendEmail(to, subject, wrapInLayout(body));
}

// Helper: get user notification preferences by email
async function getUserPrefs(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { notifications: true },
  });
  return user?.notifications || null;
}
