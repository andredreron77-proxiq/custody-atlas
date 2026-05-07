import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn("[billing] STRIPE_SECRET_KEY is not configured.");
}

const stripe = new Stripe(stripeSecretKey ?? "", {
  apiVersion: "2024-12-18.acacia" as never,
});

async function updateUserProfileBilling(
  userId: string,
  fields: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    tier?: "free" | "pro";
  },
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const payload = {
    id: userId,
    stripe_customer_id: fields.stripeCustomerId ?? null,
    stripe_subscription_id: fields.stripeSubscriptionId ?? null,
    subscription_status: fields.subscriptionStatus ?? null,
    tier: fields.tier,
  };

  const { error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }
}

async function getUserProfileByStripeCustomerId(customerId: string): Promise<{ id: string } | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? { id: data.id as string } : null;
}

export async function createCheckoutSession(opts: {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: opts.userEmail,
    line_items: [
      {
        price: opts.priceId,
        quantity: 1,
      },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      userId: opts.userId,
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout session did not return a URL.");
  }

  return session.url;
}

export async function createPortalSession(opts: {
  userId: string;
  returnUrl: string;
}): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("id", opts.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const customerId = typeof data?.stripe_customer_id === "string" ? data.stripe_customer_id : "";
  if (!customerId) {
    throw new Error("No Stripe customer found for this user.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: opts.returnUrl,
  });

  return session.url;
}

export async function handleWebhookEvent(
  payload: Buffer,
  signature: string,
): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

      if (!userId || !customerId) {
        console.warn("[billing] checkout.session.completed missing userId or customerId", {
          userId,
          customerId,
        });
        return;
      }

      try {
        await updateUserProfileBilling(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: "active",
          tier: "pro",
        });
      } catch (err) {
        throw err;
      }
      return;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const user = await getUserProfileByStripeCustomerId(customerId);
      if (!user) return;

      const activeStatuses = new Set(["active", "trialing"]);
      const billingIssueStatuses = new Set(["past_due", "unpaid"]);
      const status = subscription.status;

      if (activeStatuses.has(status)) {
        await updateUserProfileBilling(user.id, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          tier: "pro",
        });
        return;
      }

      if (billingIssueStatuses.has(status)) {
        console.warn("[billing] subscription requires follow-up", {
          userId: user.id,
          customerId,
          subscriptionId: subscription.id,
          status,
        });
        await updateUserProfileBilling(user.id, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          tier: "pro",
        });
        return;
      }

      if (status === "canceled") {
        await updateUserProfileBilling(user.id, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          tier: "free",
        });
      }
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const user = await getUserProfileByStripeCustomerId(customerId);
      if (!user) return;

      await updateUserProfileBilling(user.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        tier: "free",
      });
      return;
    }

    default:
      return;
  }
}
