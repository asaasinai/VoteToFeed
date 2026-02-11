import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStripeAsync } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { VOTE_PACKAGES, calculateMeals } from "@/lib/utils";
import { getMealRate, getAnimalType } from "@/lib/admin-settings";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { tier } = await req.json();

    const pkg = VOTE_PACKAGES.find((p) => p.tier === tier);
    if (!pkg) {
      return NextResponse.json(
        { error: "Invalid package tier" },
        { status: 400 }
      );
    }

    const [mealRate, animalType] = await Promise.all([
      getMealRate(),
      getAnimalType(),
    ]);

    const meals = calculateMeals(pkg.price, mealRate);

    // Create Stripe checkout session (uses DB key if set, else env)
    const stripe = await getStripeAsync();
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${pkg.label} Vote Pack - ${pkg.votes} Votes`,
              description: `Feeds ~${meals} shelter pets in need`,
            },
            unit_amount: pkg.price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=success&tier=${tier}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=cancelled`,
      metadata: {
        userId,
        tier,
        votes: pkg.votes.toString(),
        amount: pkg.price.toString(),
        mealRate: mealRate.toString(),
        meals: meals.toString(),
      },
    });

    // Create pending purchase record
    await prisma.purchase.create({
      data: {
        userId,
        packageTier: tier,
        votes: pkg.votes,
        amount: pkg.price,
        stripeSessionId: checkoutSession.id,
        status: "PENDING",
        mealsProvided: meals,
        mealRateAtPurchase: mealRate,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
