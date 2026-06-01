import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BLOCKED_DOMAINS = [
  "vitrineturbo.com",
  "www.vitrineturbo.com",
  "netlify.app",
  "netlify.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "whatsapp.com",
  "supabase.co",
  "vercel.app",
  "github.com",
];

function isValidDomain(domain: string): boolean {
  const pattern = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
  return pattern.test(domain) && domain.length <= 253;
}

function isDomainBlocked(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return BLOCKED_DOMAINS.some(
    (blocked) =>
      normalized === blocked ||
      normalized === blocked.replace(/^www\./, "") ||
      normalized.endsWith("." + blocked) ||
      normalized.endsWith("." + blocked.replace(/^www\./, ""))
  );
}

function generateVerificationToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "vt-verify-";
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const netlifyToken = Deno.env.get("NETLIFY_ACCESS_TOKEN");
    const netlifySiteId = Deno.env.get("NETLIFY_SITE_ID");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, plan_status, billing_cycle, slug")
      .eq("id", user.id)
      .maybeSingle();

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userData.plan_status !== "active" || userData.billing_cycle !== "annually") {
      return new Response(
        JSON.stringify({ error: "Este recurso esta disponivel apenas para assinantes do plano anual." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();

    switch (action) {
      case "register":
        return await handleRegister(req, supabase, user.id);
      case "verify-dns":
        return await handleVerifyDns(supabase, user.id);
      case "activate":
        return await handleActivate(supabase, user.id, netlifyToken, netlifySiteId);
      case "remove":
        return await handleRemove(supabase, user.id, netlifyToken, netlifySiteId);
      case "status":
        return await handleStatus(supabase, user.id);
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error in manage-custom-domain:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleRegister(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { domain } = await req.json();

  if (!domain || typeof domain !== "string") {
    return new Response(
      JSON.stringify({ error: "Dominio invalido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const normalizedDomain = domain.toLowerCase().trim();

  if (!isValidDomain(normalizedDomain)) {
    return new Response(
      JSON.stringify({ error: "Formato de dominio invalido. Use um dominio valido como: www.seudominio.com.br" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (isDomainBlocked(normalizedDomain)) {
    return new Response(
      JSON.stringify({ error: "Este dominio nao pode ser utilizado." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: existing } = await supabase
    .from("custom_domains")
    .select("id")
    .eq("domain", normalizedDomain)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ error: "Este dominio ja esta em uso por outro usuario." }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  await supabase.from("custom_domains").delete().eq("user_id", userId);

  const verificationToken = generateVerificationToken();

  const { data, error } = await supabase
    .from("custom_domains")
    .insert({
      user_id: userId,
      domain: normalizedDomain,
      status: "pending_dns",
      verification_token: verificationToken,
    })
    .select()
    .single();

  if (error) {
    console.error("Error registering domain:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao registrar dominio." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      domain: data,
      instructions: {
        cname_host: normalizedDomain.startsWith("www.") ? "www" : normalizedDomain.split(".")[0],
        cname_value: "vitrineturbo.netlify.app",
        txt_host: `_vitrineturbo-verify.${normalizedDomain.replace(/^www\./, "")}`,
        txt_value: verificationToken,
      },
    }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleVerifyDns(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: domainRecord, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !domainRecord) {
    return new Response(
      JSON.stringify({ error: "Nenhum dominio registrado." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (domainRecord.status === "active") {
    return new Response(
      JSON.stringify({ success: true, message: "Dominio ja esta ativo.", domain: domainRecord }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const baseDomain = domainRecord.domain.replace(/^www\./, "");
  const txtHost = `_vitrineturbo-verify.${baseDomain}`;

  let verified = false;

  try {
    const dnsResponse = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(txtHost)}&type=TXT`
    );
    const dnsData = await dnsResponse.json();

    if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
      for (const answer of dnsData.Answer) {
        const txtValue = (answer.data || "").replace(/"/g, "").trim();
        if (txtValue === domainRecord.verification_token) {
          verified = true;
          break;
        }
      }
    }
  } catch (dnsError) {
    console.error("DNS lookup error:", dnsError);
    return new Response(
      JSON.stringify({ error: "Erro ao verificar DNS. Tente novamente em alguns minutos." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!verified) {
    await supabase
      .from("custom_domains")
      .update({ status: "pending_dns", updated_at: new Date().toISOString() })
      .eq("id", domainRecord.id);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Registro TXT nao encontrado. Verifique se o registro DNS foi configurado corretamente e aguarde a propagacao (pode levar ate 48 horas).",
        domain: { ...domainRecord, status: "pending_dns" },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  await supabase
    .from("custom_domains")
    .update({ status: "dns_verified", updated_at: new Date().toISOString() })
    .eq("id", domainRecord.id);

  return new Response(
    JSON.stringify({
      success: true,
      message: "DNS verificado com sucesso! Voce pode agora ativar o dominio.",
      domain: { ...domainRecord, status: "dns_verified" },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleActivate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  netlifyToken: string | undefined,
  netlifySiteId: string | undefined
) {
  if (!netlifyToken || !netlifySiteId) {
    return new Response(
      JSON.stringify({ error: "Configuracao do Netlify nao encontrada. Contate o suporte." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: domainRecord, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !domainRecord) {
    return new Response(
      JSON.stringify({ error: "Nenhum dominio registrado." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (domainRecord.status !== "dns_verified" && domainRecord.status !== "error") {
    return new Response(
      JSON.stringify({ error: "O DNS precisa ser verificado antes de ativar o dominio." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const getSiteResponse = await fetch(
      `https://api.netlify.com/api/v1/sites/${netlifySiteId}`,
      { headers: { Authorization: `Bearer ${netlifyToken}` } }
    );

    if (!getSiteResponse.ok) {
      throw new Error(`Failed to get site info: ${getSiteResponse.status}`);
    }

    const siteData = await getSiteResponse.json();
    const currentAliases: string[] = siteData.domain_aliases || [];

    if (!currentAliases.includes(domainRecord.domain)) {
      currentAliases.push(domainRecord.domain);
    }

    const updateResponse = await fetch(
      `https://api.netlify.com/api/v1/sites/${netlifySiteId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${netlifyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain_aliases: currentAliases }),
      }
    );

    if (!updateResponse.ok) {
      const errorBody = await updateResponse.text();
      throw new Error(`Failed to update site aliases: ${updateResponse.status} - ${errorBody}`);
    }

    const now = new Date().toISOString();
    await supabase
      .from("custom_domains")
      .update({ status: "active", activated_at: now, updated_at: now, error_message: null })
      .eq("id", domainRecord.id);

    await supabase
      .from("users")
      .update({ custom_domain: domainRecord.domain })
      .eq("id", userId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Dominio ativado com sucesso! O SSL sera provisionado automaticamente em alguns minutos.",
        domain: { ...domainRecord, status: "active", activated_at: now },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (activateError) {
    console.error("Netlify activation error:", activateError);

    await supabase
      .from("custom_domains")
      .update({
        status: "error",
        error_message: `Erro ao ativar no Netlify: ${activateError instanceof Error ? activateError.message : "Unknown error"}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainRecord.id);

    return new Response(
      JSON.stringify({ error: "Erro ao ativar dominio no servidor. Tente novamente ou contate o suporte." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

async function handleRemove(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  netlifyToken: string | undefined,
  netlifySiteId: string | undefined
) {
  const { data: domainRecord, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !domainRecord) {
    return new Response(
      JSON.stringify({ error: "Nenhum dominio registrado." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (domainRecord.status === "active" && netlifyToken && netlifySiteId) {
    try {
      const getSiteResponse = await fetch(
        `https://api.netlify.com/api/v1/sites/${netlifySiteId}`,
        { headers: { Authorization: `Bearer ${netlifyToken}` } }
      );

      if (getSiteResponse.ok) {
        const siteData = await getSiteResponse.json();
        const currentAliases: string[] = (siteData.domain_aliases || []).filter(
          (alias: string) => alias !== domainRecord.domain
        );

        await fetch(
          `https://api.netlify.com/api/v1/sites/${netlifySiteId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${netlifyToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ domain_aliases: currentAliases }),
          }
        );
      }
    } catch (netlifyError) {
      console.error("Error removing domain from Netlify:", netlifyError);
    }
  }

  await supabase.from("custom_domains").delete().eq("id", domainRecord.id);

  await supabase
    .from("users")
    .update({ custom_domain: null })
    .eq("id", userId);

  return new Response(
    JSON.stringify({ success: true, message: "Dominio removido com sucesso." }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: domainRecord, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return new Response(
      JSON.stringify({ error: "Erro ao buscar status do dominio." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ domain: domainRecord }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
