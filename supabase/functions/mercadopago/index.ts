import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PayerInfo {
  email: string;
  first_name: string;
  last_name: string;
  doc: string;
}

interface PixPaymentPayload {
  plan_id: string;
  billing_cycle: string;
  payer: PayerInfo;
  early_renewal?: boolean;
}

interface CardPaymentPayload {
  plan_id: string;
  billing_cycle: string;
  token: string;
  installments: number;
  payment_method_id: string;
  issuer_id: string;
  payer: { email: string; doc: string };
  early_renewal?: boolean;
}

async function getConfig(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from("mercadopago_config")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Mercado Pago não configurado");
  }
  return data;
}

function getAccessToken(config: any): string {
  if (config.environment === "production") {
    return config.access_token_prod;
  }
  return config.access_token_test;
}

function getPublicKeyFromConfig(config: any): string {
  if (config.environment === "production") {
    return config.public_key_prod;
  }
  return config.public_key_test;
}

async function activatePlan(
  admin: ReturnType<typeof createClient>,
  userId: string,
  planId: string,
  billingCycle: string,
  earlyRenewal = false
) {
  const monthsMap: Record<string, number> = {
    Mensal: 1,
    monthly: 1,
    Trimestral: 3,
    quarterly: 3,
    Semestral: 6,
    semiannually: 6,
    Anual: 12,
    annually: 12,
  };

  const months = monthsMap[billingCycle] || 1;
  const now = new Date();

  let baseDate = now;
  if (earlyRenewal) {
    const { data: currentUser } = await admin
      .from("users")
      .select("subscription_end_date, plan_status")
      .eq("id", userId)
      .maybeSingle();

    if (
      currentUser?.plan_status === "active" &&
      currentUser?.subscription_end_date
    ) {
      const currentEnd = new Date(currentUser.subscription_end_date);
      if (currentEnd > now) {
        baseDate = currentEnd;
      }
    }
  }

  const expiresAt = new Date(baseDate);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const nextPaymentDate = new Date(expiresAt);

  const billingCycleDb =
    months === 1
      ? "monthly"
      : months === 3
        ? "quarterly"
        : months === 6
          ? "semiannually"
          : "annually";

  const { data: plan } = await admin
    .from("subscription_plans")
    .select("name, price")
    .eq("id", planId)
    .maybeSingle();

  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existingSub) {
    await admin
      .from("subscriptions")
      .update({
        plan_name: plan?.name || "Plano Pago",
        monthly_price: plan?.price || 0,
        billing_cycle: billingCycleDb,
        status: "active",
        payment_status: "paid",
        start_date: now.toISOString().split("T")[0],
        next_payment_date: expiresAt.toISOString().split("T")[0],
        updated_at: now.toISOString(),
      })
      .eq("id", existingSub.id);
  } else {
    await admin.from("subscriptions").insert({
      user_id: userId,
      plan_name: plan?.name || "Plano Pago",
      monthly_price: plan?.price || 0,
      billing_cycle: billingCycleDb,
      status: "active",
      payment_status: "paid",
      start_date: now.toISOString().split("T")[0],
      next_payment_date: expiresAt.toISOString().split("T")[0],
    });
  }

  await admin
    .from("users")
    .update({
      plan_status: "active",
      subscription_end_date: expiresAt.toISOString().split("T")[0],
      next_payment_date: nextPaymentDate.toISOString().split("T")[0],
      billing_cycle: billingCycleDb,
    })
    .eq("id", userId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { action, payload } = await req.json();

    switch (action) {
      case "getPublicKey": {
        const config = await getConfig(admin);
        const publicKey = getPublicKeyFromConfig(config);
        return new Response(
          JSON.stringify({ public_key: publicKey, environment: config.environment }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createPixPayment": {
        const { plan_id, billing_cycle, payer, early_renewal } =
          payload as PixPaymentPayload;

        const { data: plan } = await admin
          .from("subscription_plans")
          .select("id, name, price")
          .eq("id", plan_id)
          .maybeSingle();

        if (!plan) {
          return new Response(
            JSON.stringify({ error: "Plano não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const amountCents = Math.round(plan.price * 100);
        const config = await getConfig(admin);
        const accessToken = getAccessToken(config);

        const { data: paymentRow, error: insertErr } = await admin
          .from("mp_payments")
          .insert({
            user_id: user.id,
            plan_id: plan.id,
            billing_cycle,
            amount_cents: amountCents,
            payment_method: "pix",
            payer_email: payer.email,
            payer_doc: payer.doc,
            environment: config.environment,
            early_renewal: early_renewal ?? false,
          })
          .select("id")
          .single();

        if (insertErr || !paymentRow) {
          throw new Error("Erro ao registrar pagamento");
        }

        const docType = payer.doc.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";

        const mpBody = {
          transaction_amount: plan.price,
          payment_method_id: "pix",
          payer: {
            email: payer.email,
            first_name: payer.first_name,
            last_name: payer.last_name,
            identification: {
              type: docType,
              number: payer.doc.replace(/\D/g, ""),
            },
          },
          notification_url: config.notification_url || undefined,
          external_reference: paymentRow.id,
        };

        const mpResponse = await fetch(
          "https://api.mercadopago.com/v1/payments",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Idempotency-Key": paymentRow.id,
            },
            body: JSON.stringify(mpBody),
          }
        );

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
          await admin
            .from("mp_payments")
            .update({
              status: "rejected",
              status_detail: mpData.message || "API error",
              raw_response: mpData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentRow.id);

          return new Response(
            JSON.stringify({ error: mpData.message || "Erro ao criar pagamento PIX" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const pixData = mpData.point_of_interaction?.transaction_data;
        const expiresAt = mpData.date_of_expiration || null;

        await admin
          .from("mp_payments")
          .update({
            mp_payment_id: String(mpData.id),
            status: mpData.status || "pending",
            status_detail: mpData.status_detail || "",
            pix_qr_code: pixData?.qr_code || "",
            pix_qr_code_base64: pixData?.qr_code_base64 || "",
            pix_ticket_url: pixData?.ticket_url || "",
            pix_expires_at: expiresAt,
            raw_response: mpData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentRow.id);

        return new Response(
          JSON.stringify({
            payment_id: paymentRow.id,
            mp_payment_id: String(mpData.id),
            status: mpData.status,
            pix_qr_code: pixData?.qr_code || "",
            pix_qr_code_base64: pixData?.qr_code_base64 || "",
            pix_ticket_url: pixData?.ticket_url || "",
            expires_at: expiresAt,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createCardPayment": {
        const {
          plan_id,
          billing_cycle,
          token,
          installments,
          payment_method_id,
          issuer_id,
          payer: cardPayer,
          early_renewal,
        } = payload as CardPaymentPayload;

        const { data: plan } = await admin
          .from("subscription_plans")
          .select("id, name, price")
          .eq("id", plan_id)
          .maybeSingle();

        if (!plan) {
          return new Response(
            JSON.stringify({ error: "Plano não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const amountCents = Math.round(plan.price * 100);
        const config = await getConfig(admin);
        const accessToken = getAccessToken(config);

        const { data: paymentRow, error: insertErr } = await admin
          .from("mp_payments")
          .insert({
            user_id: user.id,
            plan_id: plan.id,
            billing_cycle,
            amount_cents: amountCents,
            payment_method: "credit_card",
            payer_email: cardPayer.email,
            payer_doc: cardPayer.doc,
            installments,
            environment: config.environment,
            early_renewal: early_renewal ?? false,
          })
          .select("id")
          .single();

        if (insertErr || !paymentRow) {
          throw new Error("Erro ao registrar pagamento");
        }

        const docType =
          cardPayer.doc.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";

        const mpBody = {
          transaction_amount: plan.price,
          token,
          installments,
          payment_method_id,
          issuer_id,
          payer: {
            email: cardPayer.email,
            identification: {
              type: docType,
              number: cardPayer.doc.replace(/\D/g, ""),
            },
          },
          notification_url: config.notification_url || undefined,
          external_reference: paymentRow.id,
        };

        const mpResponse = await fetch(
          "https://api.mercadopago.com/v1/payments",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Idempotency-Key": paymentRow.id,
            },
            body: JSON.stringify(mpBody),
          }
        );

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
          await admin
            .from("mp_payments")
            .update({
              status: "rejected",
              status_detail: mpData.message || "API error",
              raw_response: mpData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentRow.id);

          return new Response(
            JSON.stringify({ error: mpData.message || "Erro ao processar pagamento com cartão" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const cardInfo = mpData.card || {};
        const last4 = cardInfo.last_four_digits || "";
        const brand = mpData.payment_method_id || "";

        await admin
          .from("mp_payments")
          .update({
            mp_payment_id: String(mpData.id),
            status: mpData.status || "rejected",
            status_detail: mpData.status_detail || "",
            card_last4: last4,
            card_brand: brand,
            raw_response: mpData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentRow.id);

        if (mpData.status === "approved") {
          await activatePlan(admin, user.id, plan.id, billing_cycle, early_renewal ?? false);
        }

        return new Response(
          JSON.stringify({
            payment_id: paymentRow.id,
            mp_payment_id: String(mpData.id),
            status: mpData.status,
            status_detail: mpData.status_detail || "",
            card_last4: last4,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getPaymentStatus": {
        const { payment_id } = payload as { payment_id: string };

        const { data: payment } = await admin
          .from("mp_payments")
          .select("id, status, status_detail, pix_qr_code, pix_qr_code_base64, pix_expires_at, card_last4, card_brand, payment_method, updated_at")
          .eq("id", payment_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!payment) {
          return new Response(
            JSON.stringify({ error: "Pagamento não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify(payment),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Ação não reconhecida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
