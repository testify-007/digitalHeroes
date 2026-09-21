// =============================================================================
// supabase/functions/stripe-webhook/index.ts
//
// Digital Heroes — Stripe Webhook Handler
// ----------------------------------------
// Handles incoming Stripe subscription lifecycle events and synchronises the
// public.subscriptions table in Supabase.
//
// Supported events:
//   • customer.subscription.created  → upsert with mapped status
//   • customer.subscription.updated  → upsert with mapped status
//   • customer.subscription.deleted  → mark subscription as 'inactive'
//
// Security model:
//   • Every request MUST carry a valid Stripe-Signature header.
//   • The raw request body is verified against STRIPE_WEBHOOK_SECRET using
//     Stripe's constructEventAsync(), which internally uses HMAC-SHA256.
//   • Database writes use the service-role client (bypasses RLS).
//
// Idempotency:
//   • All writes are upserts on (stripe_sub_id). Replaying a Stripe event
//     for the same subscription ID is safe and produces no side-effects.
//
// Environment variables required (set in Supabase Dashboard → Edge Functions):
//   SUPABASE_URL              — your project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (never the anon key)
//   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET     — whsec_... from Stripe Dashboard or CLI
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.3.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Initialise Stripe client
// ---------------------------------------------------------------------------
// We use Stripe's Fetch-based HTTP client, which is compatible with Deno's
// runtime (Node's http module is not available in Deno / Edge Functions).
// ---------------------------------------------------------------------------
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// ---------------------------------------------------------------------------
// Stripe status → internal status map
// ---------------------------------------------------------------------------
// Defined inline here to keep the function self-contained.
// Must stay in sync with shared_types.ts and the DB CHECK constraint.
// ---------------------------------------------------------------------------
const STRIPE_TO_INTERNAL_STATUS: Record<string, string> = {
  trialing: "pending",
  incomplete: "pending",
  active: "active",
  past_due: "lapsed",
  unpaid: "lapsed",
  canceled: "inactive",
  incomplete_expired: "inactive",
  paused: "inactive",
};

// ---------------------------------------------------------------------------
// Stripe billing interval → internal plan type
// ---------------------------------------------------------------------------
const STRIPE_INTERVAL_TO_PLAN: Record<string, string> = {
  month: "monthly",
  year: "yearly",
};

// ---------------------------------------------------------------------------
// Shared CORS headers
// ---------------------------------------------------------------------------
// Stripe sends POST requests; OPTIONS preflight must be handled.
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// ===========================================================================
// Main Handler
// ===========================================================================
serve(async (req: Request) => {
  // ── Preflight ──────────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // ── Only accept POST ────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Read raw body ───────────────────────────────────────────────────────────
  // CRITICAL: We must read the raw body BEFORE parsing it. Stripe's signature
  // verification hashes the exact bytes that were transmitted. If you parse
  // the body first (e.g., req.json()) and re-serialise, the signature check
  // will fail because JSON formatting may differ.
  const rawBody = await req.text();

  // ── Verify Stripe signature ─────────────────────────────────────────────────
  // Stripe sends a Stripe-Signature header containing a timestamp and multiple
  // HMAC-SHA256 signatures. constructEventAsync() rejects events if:
  //   • The signature does not match (tampered payload or wrong secret)
  //   • The event timestamp is older than 5 minutes (replay attack prevention)
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("[stripe-webhook] Missing Stripe-Signature header");
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      WEBHOOK_SECRET
    );
  } catch (err) {
    // A 400 tells Stripe not to retry. A 5xx would cause Stripe to retry.
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response(
      JSON.stringify({ error: `Webhook signature invalid: ${err.message}` }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

  // ── Initialise Supabase admin client ────────────────────────────────────────
  // IMPORTANT: We use the service-role key here, not the anon key. The
  // service-role key bypasses RLS, which is intentional — Stripe webhooks
  // arrive server-to-server and must be able to write regardless of RLS rules.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Route events ────────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(
          supabase,
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          supabase,
          event.data.object as Stripe.Subscription
        );
        break;

      default:
        // We don't handle every Stripe event — just acknowledge receipt so
        // Stripe doesn't keep retrying unhandled event types.
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Return 500 so Stripe retries delivery (up to 3 days with exponential
    // backoff). Only return 2xx once the write actually succeeded.
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, err);
    return new Response(
      JSON.stringify({ error: "Internal handler error", detail: err.message }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // ── Acknowledge receipt ─────────────────────────────────────────────────────
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});

// ===========================================================================
// handleSubscriptionUpsert
// ===========================================================================
// Called for both 'created' and 'updated' events.
//
// Idempotency: The upsert is keyed on stripe_sub_id using Supabase's
// onConflict option. Replaying the same event is always safe.
//
// user_id resolution strategy:
//   1. Primary:  sub.metadata.user_id   (set by our Stripe Checkout session)
//   2. Fallback: look up existing row in public.subscriptions by stripe_sub_id
//
// If neither resolves a user_id, we log and bail — we cannot create an orphan
// subscription row (user_id is NOT NULL in the schema).
// ===========================================================================
async function handleSubscriptionUpsert(
  supabase: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
) {
  // ── Resolve user_id ─────────────────────────────────────────────────────────
  // The user_id MUST be stored in Stripe's subscription metadata when the
  // Checkout session is created on the frontend/backend. Example:
  //   stripe.checkout.sessions.create({ subscription_data: { metadata: { user_id: uid } } })
  let userId: string | null = sub.metadata?.user_id ?? null;

  if (!userId) {
    // Fallback: check if we already have this subscription in our DB.
    // This handles the edge case where the webhook arrives before metadata was set.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_sub_id", sub.id)
      .maybeSingle();

    userId = existing?.user_id ?? null;
  }

  if (!userId) {
    // Cannot proceed without a user to attach the subscription to.
    // This should never happen in production if the Checkout session is
    // always created with metadata.user_id.
    console.error(
      `[stripe-webhook] Cannot resolve user_id for subscription ${sub.id}. ` +
        `Ensure metadata.user_id is set when creating the Checkout session.`
    );
    throw new Error(`Unresolvable user_id for stripe_sub_id=${sub.id}`);
  }

  // ── Map Stripe status → internal status ─────────────────────────────────────
  const internalStatus = STRIPE_TO_INTERNAL_STATUS[sub.status] ?? "inactive";

  // ── Resolve plan type ────────────────────────────────────────────────────────
  // sub.items.data[0] is the first (and usually only) line item on the subscription.
  const interval =
    sub.items?.data?.[0]?.price?.recurring?.interval ?? "month";
  const planType = STRIPE_INTERVAL_TO_PLAN[interval] ?? "monthly";

  // ── Upsert into public.subscriptions ────────────────────────────────────────
  // onConflict: 'stripe_sub_id' — if a row with this Stripe sub ID already
  // exists, UPDATE all fields. This makes every webhook delivery idempotent.
  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: sub.customer as string,
        stripe_sub_id: sub.id,
        plan_type: planType,
        status: internalStatus,
        current_period_start: new Date(
          sub.current_period_start * 1000
        ).toISOString(),
        current_period_end: new Date(
          sub.current_period_end * 1000
        ).toISOString(),
        // updated_at is handled by the DB trigger (handle_updated_at)
      },
      {
        onConflict: "stripe_sub_id",
        ignoreDuplicates: false, // always UPDATE on conflict, never silently skip
      }
    );

  if (error) {
    throw new Error(
      `DB upsert failed for subscription ${sub.id}: ${error.message}`
    );
  }

  console.log(
    `[stripe-webhook] Upserted subscription ${sub.id} ` +
      `(user=${userId}, status=${internalStatus}, plan=${planType})`
  );
}

// ===========================================================================
// handleSubscriptionDeleted
// ===========================================================================
// Stripe fires 'customer.subscription.deleted' when a subscription is
// cancelled immediately (or at period end and the period has now elapsed).
//
// We do NOT delete the row — we mark it as 'inactive' to preserve the
// subscription history for audit and reporting purposes.
// ===========================================================================
async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
) {
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "inactive",
      // current_period_end stays as-is — it records when access expired.
    })
    .eq("stripe_sub_id", sub.id);

  if (error) {
    throw new Error(
      `DB update failed marking subscription ${sub.id} inactive: ${error.message}`
    );
  }

  console.log(
    `[stripe-webhook] Marked subscription ${sub.id} as inactive (deleted)`
  );
}
