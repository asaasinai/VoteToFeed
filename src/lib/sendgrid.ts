import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@votetofeed.com";

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

  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: `Your pet ${petName} received a vote!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F97316;">🐾 New Vote for ${petName}!</h2>
        <p>${voterName} voted for ${petName}!</p>
        <p><strong>Total Votes:</strong> ${voteCount}</p>
        ${rank ? `<p><strong>Current Rank:</strong> #${rank}</p>` : ""}
        ${shelterMessage ? `<p style="color: #16A34A;">${shelterMessage}</p>` : ""}
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/pets/${petName}" 
           style="display: inline-block; padding: 12px 24px; background: #F97316; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          View ${petName}'s Profile
        </a>
      </div>
    `,
  });
}

export async function sendPurchaseConfirmation(
  to: string,
  votes: number,
  amount: number,
  mealsProvided: number,
  animalType: string
) {
  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: `Purchase Confirmed - ${votes} Votes Added!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F97316;">✅ ${votes} Votes Added to Your Account!</h2>
        <p>Thank you for your purchase of <strong>$${(amount / 100).toFixed(2)}</strong>.</p>
        <p style="color: #16A34A; font-size: 18px;">
          Your purchase helps feed <strong>${Math.round(mealsProvided)}</strong> shelter pets in need!
        </p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}" 
           style="display: inline-block; padding: 12px 24px; background: #F97316; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          Start Voting
        </a>
      </div>
    `,
  });
}

export async function sendFreeVoteReminder(
  to: string,
  userName: string,
  animalType: string,
  streak: number
) {
  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: "Don't forget your free votes this week!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F97316;">🐾 Don't Forget Your Free Votes!</h2>
        <p>Hey ${userName}, you still have free votes available this week!</p>
        <p>Your votes help shelter pets in need.</p>
        ${streak > 0 ? `<p>🔥 You're on a <strong>${streak}-week voting streak</strong>! Keep it going!</p>` : ""}
        <a href="${process.env.NEXT_PUBLIC_APP_URL}" 
           style="display: inline-block; padding: 12px 24px; background: #F97316; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          Cast Your Votes
        </a>
      </div>
    `,
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

  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: "Your Weekly Vote to Feed Summary",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F97316;">📊 Weekly Summary for ${userName}</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #F97316; color: white;">
            <th style="padding: 8px;">Pet</th><th style="padding: 8px;">Votes</th><th style="padding: 8px;">Rank</th>
          </tr>
          ${petRows}
        </table>
        <p style="color: #16A34A;">Your votes helped feed <strong>${Math.round(totalMeals)}</strong> shelter pets this week!</p>
        <p>🗳️ Your 5 free votes reset Sunday at 11:59 AM PST. Don't miss it!</p>
      </div>
    `,
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

  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: `🏆 ${petName} Won ${label} - $${(prizeValue / 100).toLocaleString()} Prize Pack!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FFD700;">🏆 Congratulations! ${petName} Won ${label}!</h2>
        <p style="font-size: 20px;">Prize Pack Value: <strong>$${(prizeValue / 100).toLocaleString()}</strong></p>
        <h3>Your Prize Pack Includes:</h3>
        <ul>
          ${prizeItems.map((item) => `<li>${item}</li>`).join("")}
        </ul>
        <p>We'll send fulfillment instructions separately. Expect delivery within 2-4 weeks.</p>
      </div>
    `,
  });
}

export default sgMail;
