import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useStorefrontAppearance } from '@/hooks/useStorefrontAppearance';
import {
  StorefrontAppearance,
  DEFAULT_APPEARANCE,
  getRadiusPx,
  getShadowCss,
  getSpacingValue,
  getFontSizeScale,
  loadGoogleFont,
} from '@/lib/appearanceDefaults';

interface StorefrontThemeContextValue {
  appearance: StorefrontAppearance;
  isActive: boolean;
  sfStyles: React.CSSProperties | undefined;
}

const StorefrontThemeContext = createContext<StorefrontThemeContextValue>({
  appearance: DEFAULT_APPEARANCE,
  isActive: false,
  sfStyles: undefined,
});

export function useStorefrontTheme() {
  return useContext(StorefrontThemeContext);
}

interface StorefrontThemeProviderProps {
  userId: string | undefined;
  isPaidPlan: boolean;
  children: ReactNode;
}

export function StorefrontThemeProvider({ userId, isPaidPlan, children }: StorefrontThemeProviderProps) {
  const { appearance, isCustomized } = useStorefrontAppearance(userId);
  const isActive = isCustomized && isPaidPlan && appearance.is_active;

  useEffect(() => {
    if (isActive) {
      loadGoogleFont(appearance.font_family);
      loadGoogleFont(appearance.heading_font_family);
    }
  }, [isActive, appearance.font_family, appearance.heading_font_family]);

  const sfStyles = useMemo<React.CSSProperties | undefined>(() => {
    if (!isActive) return undefined;
    return {
      '--sf-bg': appearance.bg_color,
      '--sf-text': appearance.text_color,
      '--sf-heading': appearance.heading_color,
      '--sf-button-bg': appearance.button_bg_color,
      '--sf-button-text': appearance.button_text_color,
      '--sf-accent': appearance.accent_color,
      '--sf-card-bg': appearance.card_bg_color,
      '--sf-card-border': appearance.card_border_color,
      '--sf-badge-bg': appearance.badge_bg_color,
      '--sf-badge-text': appearance.badge_text_color,
      '--sf-icon': appearance.icon_color,
      '--sf-muted': appearance.muted_text_color,
      '--sf-border': appearance.border_color,
      '--sf-radius-card': getRadiusPx(appearance.card_border_radius),
      '--sf-radius-btn': getRadiusPx(appearance.button_border_radius),
      '--sf-radius-img': getRadiusPx(appearance.image_border_radius),
      '--sf-shadow': getShadowCss(appearance.card_shadow),
      '--sf-gap': getSpacingValue(appearance.card_gap, 'gap'),
      '--sf-spacing': getSpacingValue(appearance.section_spacing, 'section'),
      '--sf-font': `'${appearance.font_family}', sans-serif`,
      '--sf-font-heading': `'${appearance.heading_font_family}', sans-serif`,
      '--sf-font-scale': getFontSizeScale(appearance.font_size_base),
      backgroundColor: appearance.bg_color,
      color: appearance.text_color,
      fontFamily: `'${appearance.font_family}', sans-serif`,
    } as React.CSSProperties;
  }, [isActive, appearance]);

  useEffect(() => {
    if (isActive && sfStyles) {
      const root = document.documentElement;
      root.classList.add('sf-themed');
      const vars = sfStyles as Record<string, string>;
      const appliedKeys: string[] = [];
      for (const key of Object.keys(vars)) {
        if (key.startsWith('--sf-')) {
          root.style.setProperty(key, vars[key]);
          appliedKeys.push(key);
        }
      }

      root.setAttribute('data-footer-logo-mode', appearance.footer_logo_mode);
      root.setAttribute('data-footer-logo-format', appearance.footer_logo_format ?? 'rectangular');
      if (appearance.custom_logo_url) {
        root.setAttribute('data-custom-logo-url', appearance.custom_logo_url);
      } else {
        root.removeAttribute('data-custom-logo-url');
      }

      return () => {
        root.classList.remove('sf-themed');
        appliedKeys.forEach(k => root.style.removeProperty(k));
        root.removeAttribute('data-footer-logo-mode');
        root.removeAttribute('data-footer-logo-format');
        root.removeAttribute('data-custom-logo-url');
      };
    }
  }, [isActive, sfStyles, appearance.footer_logo_mode, appearance.footer_logo_format, appearance.custom_logo_url]);

  const value = useMemo(() => ({ appearance, isActive, sfStyles }), [appearance, isActive, sfStyles]);

  return (
    <StorefrontThemeContext.Provider value={value}>
      <div className={isActive ? 'sf-themed' : 'storefront-default'} style={sfStyles}>
        {children}
      </div>
    </StorefrontThemeContext.Provider>
  );
}
