import { NextRequest, NextResponse } from "next/server";
import { getStripeAsync } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { sendPurchaseConfirmationEmail } from "@/lib/resend";
import { getAnimalType } from "@/lib/admin-settings";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const stripe = await getStripeAsync();
  const { getStripeWebhookSecret } = await import("@/lib/admin-settings");
  const webhookSecret = await getStripeWebhookSecret();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, tier, votes, amount, mealRate, meals } =
      session.metadata || {};

    if (userId && votes) {
      try {
        // Update purchase status
        await prisma.purchase.updateMany({
          where: { stripeSessionId: session.id },
          data: {
            status: "COMPLETED",
            stripePaymentId: session.payment_intent as string,
          },
        });

        // Add votes to user balance
        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            paidVoteBalance: { increment: parseInt(votes) },
          },
          select: { email: true, name: true },
        });

        // Send confirmation email
        if (user.email) {
          const animalType = await getAnimalType();
          await sendPurchaseConfirmationEmail(
            user.email,
            parseInt(votes),
            parseInt(amount || "0"),
            parseFloat(meals || "0"),
            animalType
          ).catch(console.error);
        }
      } catch (error) {
        console.error("Error processing payment:", error);
      }
    }
  }

  return NextResponse.json({ received: true });
}
