import { supabase } from './supabase';
import type {
  PromotionalOffer,
  OfferTargetingRule,
  OfferUserAssignment,
  OfferDisplayConfig,
  OfferFormData,
  OfferDisplayConfigFormData,
  OfferWithConfig,
  OfferImpressionAction,
  OfferAnalytics,
} from '../types/offers';

// --- Admin CRUD Operations ---

export async function fetchOffers(): Promise<PromotionalOffer[]> {
  const { data, error } = await supabase
    .from('promotional_offers')
    .select('*')
    .order('prioridade', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchOfferById(id: string): Promise<OfferWithConfig | null> {
  const { data: offer, error } = await supabase
    .from('promotional_offers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!offer) return null;

  const [rulesResult, configResult, impressionsResult] = await Promise.all([
    supabase.from('offer_targeting_rules').select('*').eq('offer_id', id).order('grupo_logico').order('created_at'),
    supabase.from('offer_display_config').select('*').eq('offer_id', id).maybeSingle(),
    supabase.from('offer_impressions').select('action').eq('offer_id', id),
  ]);

  const assignmentCountResult = await supabase
    .from('offer_user_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('offer_id', id);

  const impressions = impressionsResult.data || [];

  return {
    ...offer,
    targeting_rules: rulesResult.data || [],
    display_config: configResult.data || null,
    assignments_count: assignmentCountResult.count || 0,
    impressions_count: impressions.filter(i => i.action === 'exibida').length,
    clicks_count: impressions.filter(i => i.action === 'clicada').length,
    conversions_count: impressions.filter(i => i.action === 'convertida').length,
  };
}

export async function createOffer(data: OfferFormData): Promise<PromotionalOffer> {
  const { data: offer, error } = await supabase
    .from('promotional_offers')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return offer;
}

export async function updateOffer(id: string, data: Partial<OfferFormData & { is_active: boolean }>): Promise<PromotionalOffer> {
  const { data: offer, error } = await supabase
    .from('promotional_offers')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return offer;
}

export async function deleteOffer(id: string): Promise<void> {
  const { error } = await supabase
    .from('promotional_offers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function toggleOfferActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from('promotional_offers')
    .update({ is_active })
    .eq('id', id);

  if (error) throw error;
}

export async function updateOfferPriorities(updates: { id: string; prioridade: number }[]): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase
      .from('promotional_offers')
      .update({ prioridade: update.prioridade })
      .eq('id', update.id);
    if (error) throw error;
  }
}

// --- Targeting Rules ---

export async function saveTargetingRules(offerId: string, rules: Omit<OfferTargetingRule, 'id' | 'offer_id' | 'created_at'>[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('offer_targeting_rules')
    .delete()
    .eq('offer_id', offerId);

  if (deleteError) throw deleteError;

  if (rules.length === 0) return;

  const { error } = await supabase
    .from('offer_targeting_rules')
    .insert(rules.map(r => ({ ...r, offer_id: offerId })));

  if (error) throw error;
}

// --- Display Config ---

export async function saveDisplayConfig(offerId: string, config: OfferDisplayConfigFormData): Promise<void> {
  const { data: existing } = await supabase
    .from('offer_display_config')
    .select('id')
    .eq('offer_id', offerId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('offer_display_config')
      .update(config)
      .eq('offer_id', offerId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('offer_display_config')
      .insert({ ...config, offer_id: offerId });
    if (error) throw error;
  }
}

// --- User Assignments ---

export async function fetchAssignments(offerId: string): Promise<(OfferUserAssignment & { user?: { name: string; email: string } })[]> {
  const { data, error } = await supabase
    .from('offer_user_assignments')
    .select('*, user:users(name, email)')
    .eq('offer_id', offerId)
    .order('assigned_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function assignOfferToUsers(offerId: string, userIds: string[], assignedBy: string, notes?: string): Promise<void> {
  const assignments = userIds.map(userId => ({
    offer_id: offerId,
    user_id: userId,
    assigned_by: assignedBy,
    status: 'pendente' as const,
    notes: notes || '',
  }));

  const { error } = await supabase
    .from('offer_user_assignments')
    .insert(assignments);

  if (error) throw error;

  // Create notifications for assigned users
  const notifications = userIds.map(userId => ({
    user_id: userId,
    type: 'system',
    title: 'Nova oferta disponivel',
    message: 'Voce recebeu uma oferta promocional exclusiva! Confira agora.',
    related_entity_id: offerId,
    related_entity_type: 'promotional_offer',
  }));

  await supabase.from('notifications').insert(notifications);
}

export async function removeAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('offer_user_assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) throw error;
}

// --- User-facing: Fetch eligible offers ---

export async function fetchUserEligibleOffers(userId: string): Promise<PromotionalOffer[]> {
  const now = new Date().toISOString();

  // Fetch manually assigned offers
  const { data: assignments } = await supabase
    .from('offer_user_assignments')
    .select('offer_id')
    .eq('user_id', userId)
    .in('status', ['pendente', 'visualizada']);

  const assignedOfferIds = (assignments || []).map(a => a.offer_id);

  // Fetch active offers (both auto-targeted and manually assigned)
  const { data: offers, error } = await supabase
    .from('promotional_offers')
    .select('*')
    .eq('is_active', true)
    .lte('data_inicio', now)
    .or(`data_fim.is.null,data_fim.gte.${now}`)
    .order('prioridade', { ascending: true });

  if (error) throw error;
  if (!offers || offers.length === 0) return [];

  // Include offers that are manually assigned to this user
  // or that have auto-targeting rules (evaluated client-side)
  const manualOffers = offers.filter(o => assignedOfferIds.includes(o.id));
  const autoOffers = offers.filter(o => !assignedOfferIds.includes(o.id));

  return [...manualOffers, ...autoOffers];
}

export async function fetchOfferDisplayConfigs(offerIds: string[]): Promise<OfferDisplayConfig[]> {
  if (offerIds.length === 0) return [];
  const { data, error } = await supabase
    .from('offer_display_config')
    .select('*')
    .in('offer_id', offerIds);

  if (error) throw error;
  return data || [];
}

export async function fetchUserOfferImpressions(userId: string, offerIds: string[]): Promise<{ offer_id: string; action: string; created_at: string }[]> {
  if (offerIds.length === 0) return [];
  const { data, error } = await supabase
    .from('offer_impressions')
    .select('offer_id, action, created_at')
    .eq('user_id', userId)
    .in('offer_id', offerIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// --- Impression Tracking ---

export async function trackImpression(offerId: string, userId: string, action: OfferImpressionAction, context?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('offer_impressions')
    .insert({
      offer_id: offerId,
      user_id: userId,
      action,
      session_context: context || {},
    });

  if (error) console.error('Failed to track impression:', error);
}

export async function updateAssignmentStatus(offerId: string, userId: string, status: 'visualizada' | 'aceita' | 'dispensada'): Promise<void> {
  const { error } = await supabase
    .from('offer_user_assignments')
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq('offer_id', offerId)
    .eq('user_id', userId);

  if (error) console.error('Failed to update assignment status:', error);
}

// --- Analytics ---

export async function fetchOfferAnalytics(offerId: string, days: number = 30): Promise<OfferAnalytics> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data: impressions, error } = await supabase
    .from('offer_impressions')
    .select('action, created_at')
    .eq('offer_id', offerId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const all = impressions || [];
  const total_impressions = all.filter(i => i.action === 'exibida').length;
  const total_clicks = all.filter(i => i.action === 'clicada').length;
  const total_conversions = all.filter(i => i.action === 'convertida').length;
  const total_dismissals = all.filter(i => i.action === 'fechada').length;

  // Build daily data
  const dailyMap = new Map<string, { impressions: number; clicks: number; conversions: number }>();
  for (const imp of all) {
    const date = imp.created_at.split('T')[0];
    const existing = dailyMap.get(date) || { impressions: 0, clicks: 0, conversions: 0 };
    if (imp.action === 'exibida') existing.impressions++;
    else if (imp.action === 'clicada') existing.clicks++;
    else if (imp.action === 'convertida') existing.conversions++;
    dailyMap.set(date, existing);
  }

  const daily_data = Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data }));

  return {
    total_impressions,
    total_clicks,
    total_conversions,
    total_dismissals,
    ctr: total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0,
    conversion_rate: total_clicks > 0 ? (total_conversions / total_clicks) * 100 : 0,
    daily_data,
  };
}

// --- Targeting evaluation (client-side) ---

export function evaluateTargetingRules(
  rules: OfferTargetingRule[],
  userContext: {
    plan_status?: string;
    dias_cadastro: number;
    qtd_produtos: number;
    billing_cycle?: string;
    dias_ate_vencimento?: number;
    ultima_atividade_dias?: number;
    plano_nome?: string;
  }
): boolean {
  if (rules.length === 0) return true;

  // Group rules by grupo_logico (AND within group, OR between groups)
  const groups = new Map<number, OfferTargetingRule[]>();
  for (const rule of rules) {
    const existing = groups.get(rule.grupo_logico) || [];
    existing.push(rule);
    groups.set(rule.grupo_logico, existing);
  }

  // OR between groups: at least one group must pass
  for (const [, groupRules] of groups) {
    const groupPasses = groupRules.every(rule => evaluateSingleRule(rule, userContext));
    if (groupPasses) return true;
  }

  return false;
}

function evaluateSingleRule(
  rule: OfferTargetingRule,
  ctx: {
    plan_status?: string;
    dias_cadastro: number;
    qtd_produtos: number;
    billing_cycle?: string;
    dias_ate_vencimento?: number;
    ultima_atividade_dias?: number;
    plano_nome?: string;
  }
): boolean {
  let fieldValue: string | number | undefined;

  switch (rule.tipo_regra) {
    case 'plan_status':
      fieldValue = ctx.plan_status || 'free';
      break;
    case 'dias_cadastro':
      fieldValue = ctx.dias_cadastro;
      break;
    case 'qtd_produtos':
      fieldValue = ctx.qtd_produtos;
      break;
    case 'billing_cycle':
      fieldValue = ctx.billing_cycle || '';
      break;
    case 'dias_ate_vencimento':
      fieldValue = ctx.dias_ate_vencimento ?? 999;
      break;
    case 'atividade_recente':
      fieldValue = ctx.ultima_atividade_dias ?? 0;
      break;
    case 'plano_especifico':
      fieldValue = ctx.plano_nome || '';
      break;
    default:
      return false;
  }

  const numValue = typeof fieldValue === 'number' ? fieldValue : parseFloat(fieldValue);
  const ruleNum = parseFloat(rule.valor);
  const ruleNum2 = parseFloat(rule.valor_secundario);

  switch (rule.operador) {
    case 'igual':
      return String(fieldValue) === rule.valor;
    case 'diferente':
      return String(fieldValue) !== rule.valor;
    case 'maior_que':
      return !isNaN(numValue) && !isNaN(ruleNum) && numValue > ruleNum;
    case 'menor_que':
      return !isNaN(numValue) && !isNaN(ruleNum) && numValue < ruleNum;
    case 'entre':
      return !isNaN(numValue) && !isNaN(ruleNum) && !isNaN(ruleNum2) && numValue >= ruleNum && numValue <= ruleNum2;
    case 'contem':
      return String(fieldValue).toLowerCase().includes(rule.valor.toLowerCase());
    default:
      return false;
  }
}

// --- Count eligible users for targeting preview ---

export async function countEligibleUsers(rules: Omit<OfferTargetingRule, 'id' | 'offer_id' | 'created_at'>[]): Promise<number> {
  if (rules.length === 0) {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .neq('role', 'admin');
    return count || 0;
  }

  // Fetch all non-admin users with relevant data
  const { data: users } = await supabase
    .from('users')
    .select('id, plan_status, billing_cycle, created_at, subscription_end_date, subscription_plan_name, last_login_at')
    .neq('role', 'admin');

  if (!users) return 0;

  // For product counts, batch fetch
  const userIds = users.map(u => u.id);
  const { data: productCounts } = await supabase
    .from('products')
    .select('user_id')
    .in('user_id', userIds);

  const productCountMap = new Map<string, number>();
  for (const p of productCounts || []) {
    productCountMap.set(p.user_id, (productCountMap.get(p.user_id) || 0) + 1);
  }

  const now = new Date();
  let eligible = 0;

  for (const user of users) {
    const createdAt = new Date(user.created_at);
    const diasCadastro = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const endDate = user.subscription_end_date ? new Date(user.subscription_end_date) : null;
    const diasAteVencimento = endDate ? Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : undefined;
    const lastLogin = user.last_login_at ? new Date(user.last_login_at) : null;
    const ultimaAtividadeDias = lastLogin ? Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)) : undefined;

    const ctx = {
      plan_status: user.plan_status || 'free',
      dias_cadastro: diasCadastro,
      qtd_produtos: productCountMap.get(user.id) || 0,
      billing_cycle: user.billing_cycle || '',
      dias_ate_vencimento: diasAteVencimento,
      ultima_atividade_dias: ultimaAtividadeDias,
      plano_nome: user.subscription_plan_name || '',
    };

    const passes = evaluateTargetingRules(rules as OfferTargetingRule[], ctx);
    if (passes) eligible++;
  }

  return eligible;
}
