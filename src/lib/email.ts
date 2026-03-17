import { Resend } from "resend";
import { rankSuffix } from "@/lib/utils";

const FROM_EMAIL = "VoteToFeed <noreply@votetofeed.com>";

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
}

function emailShell(content: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FAFAFA; border-radius: 12px; overflow: hidden;">
      <!-- Header -->
      <div style="background: #EF4444; padding: 20px 32px; text-align: center;">
        <span style="color: white; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">❤️ VoteToFeed</span>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Every vote feeds a shelter pet</p>
      </div>
      <!-- Body -->
      <div style="background: #ffffff; padding: 32px; color: #171717; line-height: 1.65;">
        ${content}
      </div>
      <!-- Footer -->
      <div style="padding: 20px 32px; text-align: center; color: #737373; font-size: 12px; background: #FAFAFA; border-top: 1px solid #E5E5E5;">
        VoteToFeed &nbsp;·&nbsp; <a href="${appUrl()}" style="color: #EF4444; text-decoration: none;">votetofeed.com</a>
        <br/><span style="font-size: 11px; color: #A3A3A3;">You're receiving this because you have an account on VoteToFeed.</span>
      </div>
    </div>
  `;
}

function ctaButton(label: string, href: string) {
  return `
    <a href="${href}"
       style="display: inline-block; padding: 13px 26px; background: #EF4444; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px; margin-right: 12px; font-weight: 700; font-size: 15px;">
      ${label}
    </a>
  `;
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
  const shelterMessage = isPaidVote
    ? `This vote helps feed shelter pets in need!`
    : "";

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `Your pet ${petName} received a vote!`,
    html: emailShell(`
      <h2 style="color: #EF4444;">🐾 New Vote for ${petName}!</h2>
      <p>${voterName} voted for ${petName}!</p>
      <p><strong>Total Votes:</strong> ${voteCount}</p>
      ${rank ? `<p><strong>Current Rank:</strong> #${rank}</p>` : ""}
      ${shelterMessage ? `<p style="color: #16A34A;">${shelterMessage}</p>` : ""}
      ${ctaButton(`View ${petName}'s Profile`, `${appUrl()}/pets/${encodeURIComponent(petName)}`)}
    `),
  });
}

export async function sendPurchaseConfirmation(
  to: string,
  votes: number,
  amount: number,
  mealsProvided: number,
  animalType: string
) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `Purchase Confirmed - ${votes} Votes Added!`,
    html: emailShell(`
      <h2 style="color: #EF4444;">✅ ${votes} Votes Added to Your Account!</h2>
      <p>Thank you for your purchase of <strong>$${(amount / 100).toFixed(2)}</strong>.</p>
      <p style="color: #16A34A; font-size: 18px;">
        Your purchase helps feed <strong>${Math.round(mealsProvided)}</strong> shelter pets in need!
      </p>
      ${ctaButton("Start Voting", appUrl())}
    `),
  });
}

export async function sendFreeVoteReminder(
  to: string,
  userName: string,
  animalType: string,
  streak: number
) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: "Don't forget your free votes this week!",
    html: emailShell(`
      <h2 style="color: #EF4444;">🐾 Don't Forget Your Free Votes!</h2>
      <p>Hey ${userName}, you still have free votes available this week!</p>
      <p>Your votes help shelter pets in need.</p>
      ${streak > 0 ? `<p>🔥 You're on a <strong>${streak}-week voting streak</strong>! Keep it going!</p>` : ""}
      ${ctaButton("Cast Your Votes", appUrl())}
    `),
  });
}

export async function sendWeeklyDigest(
  to: string,
  userName: string,
  pets: Array<{ name: string; votes: number; rank: number | null }>,
  totalMeals: number,
  animalType: string
) {
  const petRows = pets
    .map(
      (p) =>
        `<tr><td>${p.name}</td><td>${p.votes} votes</td><td>${p.rank ? `#${p.rank}` : "—"}</td></tr>`
    )
    .join("");

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: "Your Weekly Vote to Feed Summary",
    html: emailShell(`
      <h2 style="color: #EF4444;">📊 Weekly Summary for ${userName}</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="background: #EF4444; color: white;">
          <th style="padding: 8px;">Pet</th><th style="padding: 8px;">Votes</th><th style="padding: 8px;">Rank</th>
        </tr>
        ${petRows}
      </table>
      <p style="color: #16A34A;">Your votes helped feed <strong>${Math.round(totalMeals)}</strong> shelter pets this week!</p>
      <p>🗳️ Your 5 free votes reset Sunday at 11:59 AM PST. Don't miss it!</p>
    `),
  });
}

export async function sendWinnerNotification(
  to: string,
  petName: string,
  placement: number,
  prizeValue: number,
  prizeItems: string[]
) {
  const placementLabels = ["1st Place", "2nd Place", "3rd Place"];
  const label = placementLabels[placement - 1] || `${placement}th Place`;

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `🏆 ${petName} Won ${label} - $${(prizeValue / 100).toLocaleString()} Prize Pack!`,
    html: emailShell(`
      <h2 style="color: #EF4444;">🏆 Congratulations! ${petName} Won ${label}!</h2>
      <p style="font-size: 20px;">Prize Pack Value: <strong>$${(prizeValue / 100).toLocaleString()}</strong></p>
      <h3>Your Prize Pack Includes:</h3>
      <ul>
        ${prizeItems.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <p>We'll send fulfillment instructions separately. Expect delivery within 2-4 weeks.</p>
    `),
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
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `⏰ ${daysLeft} days left — ${petName} is still in it!`,
    html: emailShell(`
      <h2 style="color: #EF4444;">⏰ ${daysLeft} day${daysLeft === 1 ? "" : "s"} left for ${petName}</h2>
      <p>Hey ${userName}, <strong>${petName}</strong> is still competing in <strong>${contestName}</strong>.</p>
      <p>Current rank updates are coming in daily, and there is still time to climb. Every vote helps, every share matters, and every paid vote helps feed shelter pets in need.</p>
      <p><strong>Do this now:</strong> share ${petName}'s entry and rally supporters before the clock runs out.</p>
      ${ctaButton("View Contest", `${appUrl()}/contests/${contestId}`)}
      ${ctaButton("Buy Votes", `${appUrl()}`)}
      <p style="margin-top: 20px; color: #16A34A;">Your push today can move ${petName} up the leaderboard while helping shelter pets get fed. 🐾</p>
    `),
  });
}

export async function sendDailyRankEmail(
  to: string,
  userName: string,
  petName: string,
  contestName: string,
  contestId: string,
  rank: number,
  totalEntries: number,
  votesNeededForTop3: number
) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `${petName} is currently #${rank} — top 3 wins 👀`,
    html: emailShell(`
      <h2 style="color: #EF4444;">📈 ${petName} is currently #${rank}</h2>
      <p>Hey ${userName}, here's your latest update for <strong>${contestName}</strong>.</p>
      <p><strong>${petName}</strong> is ranked <strong>#${rank}</strong> out of <strong>${totalEntries}</strong> entries.</p>
      ${votesNeededForTop3 > 0
        ? `<p>${petName} needs just <strong>${votesNeededForTop3}</strong> more vote${votesNeededForTop3 === 1 ? "" : "s"} to break into the top 3.</p>`
        : `<p>${petName} is already in the top 3. Keep the momentum going to hold the spot.</p>`}
      ${ctaButton("Share & Rally Votes", `${appUrl()}/contests/${contestId}`)}
      ${ctaButton("Buy Votes", `${appUrl()}`)}
      <p style="margin-top: 20px; color: #16A34A;">Every vote helps feed shelter pets — so climbing the rankings does good, too.</p>
    `),
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

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `${petName} was SO close… let's run it back 🐾`,
    html: emailShell(`
      <h2 style="color: #EF4444;">🐾 ${petName} was so close</h2>
      <p>Hey ${userName}, ${petName} made a strong run in <strong>${oldContestName}</strong> — and now it's time for another shot in <strong>${newContestName}</strong>.</p>
      <p>Your re-entry link will auto-fill the entry, place ${petName} into the next contest, and still let you update the photo afterward.</p>
      ${ctaButton("Re-Enter ${petName}", reentryUrl)}
      <p style="margin-top: 20px;">One click, and ${petName} is back in the running.</p>
      <p style="color: #16A34A;">Every new round means more chances to win while helping shelter pets in need.</p>
      <p style="font-size: 12px; color: #6B7280;">If the button doesn't work, copy this link into your browser:<br/>${reentryUrl}</p>
    `),
  });
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
  const subject = placement === 1
    ? `🏆 ${petName} WON 1st Place — $300 Prize Pack!`
    : placement === 0
      ? `🎉 ${petName} was selected as our Random Winner!`
      : `🎉 ${petName} won ${rankSuffix(placement)} place in ${contestName}!`;

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html: emailShell(`
      <h2 style="color: ${placement === 1 ? "#B91C1C" : "#EF4444"};">
        ${placement === 0 ? `🎉 ${petName} is our Random Winner!` : `🏆 ${petName} won ${rankSuffix(placement)} place!`}
      </h2>
      <p><strong>${petName}</strong> placed in <strong>${contestName}</strong>.</p>
      <p><strong>Prize:</strong> ${prizeTitle}</p>
      <p><strong>Prize value:</strong> $${(prizeValue / 100).toFixed(2)}</p>
      <ul>
        ${prizeItems.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <p>We'll follow up with next steps for fulfillment soon.</p>
      <p style="color: #16A34A;">Thanks for helping turn contest energy into real support for shelter pets.</p>
    `),
  });
}
