import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import type { PromotionalOffer, OfferDisplayConfig, OfferTrigger } from '../types/offers';
import {
  fetchUserEligibleOffers,
  fetchOfferDisplayConfigs,
  fetchUserOfferImpressions,
  trackImpression,
  updateAssignmentStatus,
  evaluateTargetingRules,
} from '../lib/offerService';

interface OfferQueueItem {
  offer: PromotionalOffer;
  config: OfferDisplayConfig | null;
  source: 'manual' | 'auto';
}

interface PromotionalOffersContextType {
  currentOffer: OfferQueueItem | null;
  dismissOffer: () => void;
  acceptOffer: () => void;
  triggerOfferCheck: (trigger: OfferTrigger) => void;
  hasOffers: boolean;
}

const PromotionalOffersContext = createContext<PromotionalOffersContextType>({
  currentOffer: null,
  dismissOffer: () => {},
  acceptOffer: () => {},
  triggerOfferCheck: () => {},
  hasOffers: false,
});

export function usePromotionalOffers() {
  return useContext(PromotionalOffersContext);
}

export function PromotionalOffersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [offerQueue, setOfferQueue] = useState<OfferQueueItem[]>([]);
  const [currentOffer, setCurrentOffer] = useState<OfferQueueItem | null>(null);
  const [displayConfigs, setDisplayConfigs] = useState<OfferDisplayConfig[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const lastDisplayTimeRef = useRef<Map<string, number>>(new Map());
  const displayCountRef = useRef<Map<string, number>>(new Map());
  const loadedRef = useRef(false);

  const loadEligibleOffers = useCallback(async () => {
    if (!user || user.role === 'admin') return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    try {
      const offers = await fetchUserEligibleOffers(user.id);
      if (offers.length === 0) return;

      const offerIds = offers.map(o => o.id);
      const [configs, impressions] = await Promise.all([
        fetchOfferDisplayConfigs(offerIds),
        fetchUserOfferImpressions(user.id, offerIds),
      ]);

      setDisplayConfigs(configs);

      // Also fetch targeting rules for auto-targeted offers
      const { data: rules } = await supabase
        .from('offer_targeting_rules')
        .select('*')
        .in('offer_id', offerIds);

      // Build user context for targeting evaluation
      const createdAt = new Date(user.created_at);
      const now = new Date();
      const diasCadastro = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const userContext = {
        plan_status: user.plan_status || 'free',
        dias_cadastro: diasCadastro,
        qtd_produtos: productCount || 0,
        billing_cycle: user.billing_cycle || '',
        dias_ate_vencimento: user.subscription_end_date
          ? Math.floor((new Date(user.subscription_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : undefined,
        plano_nome: user.subscription_plan_name || '',
      };

      // Filter offers by eligibility
      const eligible: OfferQueueItem[] = [];
      for (const offer of offers) {
        const offerRules = (rules || []).filter(r => r.offer_id === offer.id);
        const config = configs.find(c => c.offer_id === offer.id) || null;

        // Check if user has manual assignment
        const hasManualAssignment = impressions.length === 0 || true; // Assigned offers are already filtered by service

        // Check targeting rules for auto offers
        if (offerRules.length > 0) {
          const passes = evaluateTargetingRules(offerRules, userContext);
          if (!passes) continue;
        }

        // Check display frequency limits
        const offerImpressions = impressions.filter(i => i.offer_id === offer.id);
        const displayCount = offerImpressions.filter(i => i.action === 'exibida').length;
        const hasConverted = offerImpressions.some(i => i.action === 'convertida');
        const hasDismissed = offerImpressions.some(i => i.action === 'fechada');

        if (hasConverted) continue;

        if (config) {
          if (config.max_exibicoes_por_usuario > 0 && displayCount >= config.max_exibicoes_por_usuario) continue;

          if (config.intervalo_horas_entre_exibicoes > 0 && offerImpressions.length > 0) {
            const lastDisplay = new Date(offerImpressions[0].created_at);
            const hoursSinceLastDisplay = (now.getTime() - lastDisplay.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastDisplay < config.intervalo_horas_entre_exibicoes) continue;
          }
        }

        if (hasDismissed && !config) continue;

        eligible.push({
          offer,
          config,
          source: hasManualAssignment ? 'manual' : 'auto',
        });
      }

      setOfferQueue(eligible);
    } catch (err) {
      console.error('Failed to load promotional offers:', err);
    }
  }, [user]);

  useEffect(() => {
    loadEligibleOffers();
  }, [loadEligibleOffers]);

  // Listen for new assignments in real-time
  useEffect(() => {
    if (!user || user.role === 'admin') return;

    const channel = supabase
      .channel(`offer_assignments_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'offer_user_assignments',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        loadedRef.current = false;
        loadEligibleOffers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadEligibleOffers]);

  const triggerOfferCheck = useCallback((trigger: OfferTrigger) => {
    if (currentOffer) return;

    const now = Date.now();
    const sessionMinutes = (now - sessionStartRef.current) / (1000 * 60);

    const eligible = offerQueue.filter(item => {
      const config = item.config;
      if (!config) return trigger === 'ao_entrar';

      if (config.gatilho_acao !== trigger) return false;

      if (config.exibir_apos_minutos_navegando > 0 && sessionMinutes < config.exibir_apos_minutos_navegando) {
        return false;
      }

      const lastDisplay = lastDisplayTimeRef.current.get(item.offer.id);
      if (lastDisplay && config.intervalo_horas_entre_exibicoes > 0) {
        const hoursSince = (now - lastDisplay) / (1000 * 60 * 60);
        if (hoursSince < config.intervalo_horas_entre_exibicoes) return false;
      }

      const count = displayCountRef.current.get(item.offer.id) || 0;
      if (config.max_exibicoes_por_usuario > 0 && count >= config.max_exibicoes_por_usuario) {
        return false;
      }

      return true;
    });

    if (eligible.length > 0) {
      const next = eligible[0];
      setCurrentOffer(next);
      lastDisplayTimeRef.current.set(next.offer.id, now);
      displayCountRef.current.set(next.offer.id, (displayCountRef.current.get(next.offer.id) || 0) + 1);

      if (user) {
        trackImpression(next.offer.id, user.id, 'exibida', { trigger, page: window.location.pathname });
        updateAssignmentStatus(next.offer.id, user.id, 'visualizada');
      }
    }
  }, [currentOffer, offerQueue, user]);

  // Auto-trigger "ao_entrar" after a short delay
  useEffect(() => {
    if (offerQueue.length === 0 || currentOffer) return;

    const timer = setTimeout(() => {
      triggerOfferCheck('ao_entrar');
    }, 3000);

    return () => clearTimeout(timer);
  }, [offerQueue, currentOffer, triggerOfferCheck]);

  const dismissOffer = useCallback(() => {
    if (!currentOffer || !user) return;
    trackImpression(currentOffer.offer.id, user.id, 'fechada', { page: window.location.pathname });
    updateAssignmentStatus(currentOffer.offer.id, user.id, 'dispensada');
    setOfferQueue(prev => prev.filter(item => item.offer.id !== currentOffer.offer.id));
    setCurrentOffer(null);
  }, [currentOffer, user]);

  const acceptOffer = useCallback(() => {
    if (!currentOffer || !user) return;
    trackImpression(currentOffer.offer.id, user.id, 'clicada', { page: window.location.pathname });
    updateAssignmentStatus(currentOffer.offer.id, user.id, 'aceita');
    setCurrentOffer(null);
  }, [currentOffer, user]);

  return (
    <PromotionalOffersContext.Provider value={{
      currentOffer,
      dismissOffer,
      acceptOffer,
      triggerOfferCheck,
      hasOffers: offerQueue.length > 0,
    }}>
      {children}
    </PromotionalOffersContext.Provider>
  );
}
