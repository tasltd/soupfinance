/**
 * Account Store using Zustand
 * Manages account/tenant settings including currency
 *
 * The account store fetches and caches tenant-level settings like:
 * - Currency (for formatting monetary values)
 * - Company name
 * - Business settings
 *
 * ARCHITECTURE:
 * - Account = Tenant (multi-tenant isolation)
 * - Each tenant has its own currency and settings
 * - Currency should never be hardcoded - always use this store
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccountSettings } from '../types/settings';
import { accountSettingsApi } from '../api/endpoints/settings';

// Currency configuration mapping
export interface CurrencyConfig {
  code: string;       // ISO 4217 code (e.g., 'USD', 'GHS', 'EUR')
  symbol: string;     // Currency symbol (e.g., '$', 'GH₵', '€')
  name: string;       // Full name (e.g., 'US Dollar')
  decimals: number;   // Decimal places (usually 2)
  symbolPosition: 'before' | 'after';
}

// Common currencies supported
export const CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, symbolPosition: 'before' },
  GHS: { code: 'GHS', symbol: 'GH₵', name: 'Ghana Cedi', decimals: 2, symbolPosition: 'before' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, symbolPosition: 'before' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, symbolPosition: 'before' },
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', decimals: 2, symbolPosition: 'before' },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2, symbolPosition: 'before' },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2, symbolPosition: 'before' },
  XOF: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', decimals: 0, symbolPosition: 'after' },
  XAF: { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', decimals: 0, symbolPosition: 'after' },
  TZS: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', decimals: 2, symbolPosition: 'before' },
  UGX: { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', decimals: 0, symbolPosition: 'before' },
  RWF: { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', decimals: 0, symbolPosition: 'before' },
  // Default fallback
  DEFAULT: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, symbolPosition: 'before' },
};

interface AccountState {
  settings: AccountSettings | null;
  currencyConfig: CurrencyConfig;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  fetchSettings: () => Promise<void>;
  getCurrencyConfig: () => CurrencyConfig;
  formatCurrency: (amount: number | null | undefined) => string;
  formatCurrencyValue: (amount: number | null | undefined) => string; // Without symbol
  reset: () => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      settings: null,
      currencyConfig: CURRENCIES.DEFAULT,
      isLoading: false,
      isInitialized: false,
      error: null,

      fetchSettings: async () => {
        set({ isLoading: true, error: null });

        try {
          // Changed: Use accountSettingsApi.get() which follows the correct flow:
          // 1) GET /rest/agent/index.json → get agent with account.id (= tenant_id)
          // 2) GET /account/show/{accountId}.json → get account settings
          const settings = await accountSettingsApi.get();

          // Changed: Currency comes from account settings (set during registration)
          const rawCurrency = settings.currency?.toUpperCase();
          if (!rawCurrency) {
            console.warn('[AccountStore] No currency set for this account. Falling back to DEFAULT.');
          }
          const currencyCode = rawCurrency || 'USD';
          const currencyConfig = CURRENCIES[currencyCode] || CURRENCIES.DEFAULT;

          set({
            settings,
            currencyConfig,
            isLoading: false,
            isInitialized: true,
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch account settings';
          console.error('[AccountStore] Failed to fetch settings:', err);
          set({
            isLoading: false,
            isInitialized: true,
            error: message,
          });
        }
      },

      getCurrencyConfig: () => {
        return get().currencyConfig;
      },

      /**
       * Format a monetary amount with currency symbol
       * Uses the tenant's configured currency
       *
       * @example
       * formatCurrency(1234.56) // Returns "$1,234.56" or "GH₵1,234.56" etc.
       */
      formatCurrency: (amount: number | null | undefined): string => {
        const { currencyConfig } = get();
        const value = amount ?? 0;

        // Format number with proper decimal places and thousands separator
        const formatted = value.toLocaleString('en-US', {
          minimumFractionDigits: currencyConfig.decimals,
          maximumFractionDigits: currencyConfig.decimals,
        });

        // Apply symbol position
        if (currencyConfig.symbolPosition === 'after') {
          return `${formatted} ${currencyConfig.symbol}`;
        }
        return `${currencyConfig.symbol}${formatted}`;
      },

      /**
       * Format just the numeric value without currency symbol
       * Useful for input fields and calculations display
       */
      formatCurrencyValue: (amount: number | null | undefined): string => {
        const { currencyConfig } = get();
        const value = amount ?? 0;

        return value.toLocaleString('en-US', {
          minimumFractionDigits: currencyConfig.decimals,
          maximumFractionDigits: currencyConfig.decimals,
        });
      },

      reset: () => {
        set({
          settings: null,
          currencyConfig: CURRENCIES.DEFAULT,
          isLoading: false,
          isInitialized: false,
          error: null,
        });
      },
    }),
    {
      name: 'account-storage',
      partialize: (state) => ({
        settings: state.settings,
        currencyConfig: state.currencyConfig,
      }),
    }
  )
);

/**
 * Hook to get the current currency symbol
 */
export function useCurrencySymbol(): string {
  return useAccountStore((state) => state.currencyConfig.symbol);
}

/**
 * Hook to get the currency format function
 */
export function useFormatCurrency(): (amount: number | null | undefined) => string {
  return useAccountStore((state) => state.formatCurrency);
}

/**
 * Hook to get the currency config
 */
export function useCurrencyConfig(): CurrencyConfig {
  return useAccountStore((state) => state.currencyConfig);
}

/**
 * Standalone format function for use outside React components
 * Gets current currency from store and formats amount
 */
export function formatCurrency(amount: number | null | undefined): string {
  return useAccountStore.getState().formatCurrency(amount);
}

/**
 * Get current currency symbol for use outside React components
 */
export function getCurrencySymbol(): string {
  return useAccountStore.getState().currencyConfig.symbol;
}
