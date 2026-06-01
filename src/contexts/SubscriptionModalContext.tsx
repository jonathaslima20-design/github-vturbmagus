import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import type { LimitReason } from '@/types';

interface SubscriptionModalContextType {
  isOpen: boolean;
  isForced: boolean;
  limitReason: LimitReason;
  openModal: (forced?: boolean, reason?: LimitReason) => void;
  closeModal: () => void;
  forceClose: () => void;
  setForced: (forced: boolean) => void;
}

const SubscriptionModalContext = createContext<SubscriptionModalContextType | undefined>(undefined);

export function SubscriptionModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isForced, setIsForced] = useState(false);
  const [limitReason, setLimitReason] = useState<LimitReason>(null);

  // Use ref so callbacks never go stale and don't trigger re-renders in dependents
  const isForcedRef = useRef(false);

  const openModal = useCallback((forced = false, reason: LimitReason = null) => {
    isForcedRef.current = forced;
    setIsOpen(true);
    setIsForced(forced);
    setLimitReason(reason);
  }, []);

  // closeModal closes the dialog visually; forced state is preserved so SubscriptionBlocker can re-open
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setLimitReason(null);
  }, []);

  // forceClose bypasses the isForced guard — for programmatic use only
  const forceClose = useCallback(() => {
    isForcedRef.current = false;
    setIsForced(false);
    setIsOpen(false);
    setLimitReason(null);
  }, []);

  const setForcedState = useCallback((forced: boolean) => {
    isForcedRef.current = forced;
    setIsForced(forced);
  }, []);

  const value = {
    isOpen,
    isForced,
    limitReason,
    openModal,
    closeModal,
    forceClose,
    setForced: setForcedState,
  };

  return (
    <SubscriptionModalContext.Provider value={value}>
      {children}
    </SubscriptionModalContext.Provider>
  );
}

export function useSubscriptionModal() {
  const context = useContext(SubscriptionModalContext);
  if (context === undefined) {
    throw new Error('useSubscriptionModal must be used within SubscriptionModalProvider');
  }
  return context;
}
