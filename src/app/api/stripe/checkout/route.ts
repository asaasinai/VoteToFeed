import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStripeAsync } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { VOTE_PACKAGES, calculateMeals } from "@/lib/utils";
import { getMealRate, getFirstTimeBuyerDiscount } from "@/lib/admin-settings";

const VTF_BRAND = "votetofeed";
const VTF_SITE = "votetofeed.com";

export async function POST(req: NextRequest) {
  let purchaseId: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { tier, petId } = await req.json();
    const sourcePetId = typeof petId === "string" && petId.trim() ? petId.trim() : null;

    const pkg = VOTE_PACKAGES.find((p) => p.tier === tier);
    if (!pkg) {
      return NextResponse.json(
        { error: "Invalid package tier" },
        { status: 400 }
      );
    }

    if (sourcePetId) {
      const sourcePet = await prisma.pet.findUnique({
        where: { id: sourcePetId },
        select: { id: true, isActive: true },
      });

      if (!sourcePet?.isActive) {
        return NextResponse.json(
          { error: "Selected pet is no longer available" },
          { status: 400 }
        );
      }
    }

    // Validate Stripe configuration before creating a pending purchase.
    let stripe;
    try {
      stripe = await getStripeAsync();
    } catch (error) {
      console.error("Stripe is not configured for checkout:", error);
      return NextResponse.json(
        { error: "Vote purchases are temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }

    const mealRate = await getMealRate();
    const discount = await getFirstTimeBuyerDiscount();
    const meals = calculateMeals(pkg.price, mealRate);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://votetofeed.com";

    // Create pending purchase record first so we can attach its ID to Stripe metadata
    const purchase = await prisma.purchase.create({
      data: {
        userId,
        packageTier: tier,
        votes: pkg.votes,
        amount: pkg.price,   // will be updated to final price after discount check
        status: "PENDING",
        mealsProvided: meals,
        mealRateAtPurchase: mealRate,
      },
    });
    purchaseId = purchase.id;

    const metadata = {
      brand: VTF_BRAND,
      site: VTF_SITE,
      purchaseId: purchase.id,
      userId,
      tier,
      votes: pkg.votes.toString(),
      amount: pkg.price.toString(),
      mealRate: mealRate.toString(),
      meals: meals.toString(),
      ...(sourcePetId ? { petId: sourcePetId } : {}),
    };

    // Check if first-time buyer — include PENDING to block the race condition
    // where two parallel tabs both create PENDING purchases before either completes,
    // and both incorrectly qualify for the 20% discount.
    const previousPurchase = await prisma.purchase.findFirst({
      where: { userId, status: { in: ["COMPLETED", "PENDING"] }, id: { not: purchase.id } },
    });
    const isFirstTimeBuyer = !previousPurchase;

    // 3DS required for $249+ transactions
    const requires3DS = pkg.price >= 24900;

    // Apply first-time buyer discount if enabled
    const discountMultiplier = (discount.enabled && isFirstTimeBuyer)
      ? (100 - discount.pct) / 100
      : 1;
    const finalPrice = Math.round(pkg.price * discountMultiplier);
    const appliedDiscount = discount.enabled && isFirstTimeBuyer;

    const successParams = new URLSearchParams({ purchase: "success", tier });
    const cancelParams = new URLSearchParams({ purchase: "cancelled", tier });
    if (appliedDiscount) successParams.set("firstBuyer", "1");
    if (sourcePetId) {
      successParams.set("pet", sourcePetId);
      cancelParams.set("pet", sourcePetId);
    }

    // Update purchase record with final price and discount info
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        amount: finalPrice,
        isFirstTimeBuyer: appliedDiscount,
        originalAmount: appliedDiscount ? pkg.price : 0,
        discountPct: appliedDiscount ? discount.pct : 0,
      },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      client_reference_id: purchase.id,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `[VTF] ${pkg.label} Vote Pack - ${pkg.votes} Votes`,
              description: `Feeds ~${meals} shelter pets in need`,
              metadata: {
                brand: VTF_BRAND,
                site: VTF_SITE,
              },
            },
            unit_amount: finalPrice,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${appUrl}/dashboard?${successParams.toString()}`,
      cancel_url: `${appUrl}/dashboard?${cancelParams.toString()}`,
      metadata: {
        ...metadata,
        isFirstTimeBuyer: (discount.enabled && isFirstTimeBuyer) ? "1" : "0",
        discountPct: (discount.enabled && isFirstTimeBuyer) ? discount.pct.toString() : "0",
        originalAmount: pkg.price.toString(),
      },
      payment_intent_data: {
        metadata,
        description: `VoteToFeed ${pkg.label} vote pack (${pkg.votes} votes)`,
      },
      ...(requires3DS && {
        payment_method_options: {
          card: {
            request_three_d_secure: "any",
          },
        },
      }),
    });

    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        stripeSessionId: checkoutSession.id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    if (purchaseId) {
      await prisma.purchase.delete({ where: { id: purchaseId } }).catch((cleanupError) => {
        console.error("Failed to clean up pending purchase after checkout error:", cleanupError);
      });
    }

    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Unable to start checkout right now. Please try again shortly." },
      { status: 500 }
    );
  }
}
