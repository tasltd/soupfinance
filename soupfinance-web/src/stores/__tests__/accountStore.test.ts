/**
 * Unit tests for accountStore currency formatting (SOUPFIN-59)
 *
 * The defect: `formatCurrency` concatenated `symbol + toLocaleString(value)`,
 * and `toLocaleString` already carries its own leading minus. A negative
 * therefore rendered as "GH₵-1,200.00" instead of "-GH₵1,200.00".
 *
 * Every money figure in the app routes through this formatter, so both symbol
 * positions ('before' and 'after') and both the zero and overflow ends of the
 * range are covered here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CURRENCIES,
  formatAmountWithConfig,
  useAccountStore,
} from '../accountStore'

const GHS = CURRENCIES.GHS // symbolPosition: 'before', 2 decimals
const USD = CURRENCIES.USD // symbolPosition: 'before', 2 decimals
const XOF = CURRENCIES.XOF // symbolPosition: 'after',  0 decimals
const XAF = CURRENCIES.XAF // symbolPosition: 'after',  0 decimals

describe('formatAmountWithConfig', () => {
  describe("symbolPosition: 'before'", () => {
    it('renders a positive amount with the symbol leading', () => {
      expect(formatAmountWithConfig(1200, GHS)).toBe('GH₵1,200.00')
    })

    it('puts the minus BEFORE the symbol for a negative amount', () => {
      expect(formatAmountWithConfig(-1200, GHS)).toBe('-GH₵1,200.00')
    })

    it('never emits the symbol-then-minus form', () => {
      expect(formatAmountWithConfig(-1200, GHS)).not.toBe('GH₵-1,200.00')
      expect(formatAmountWithConfig(-1200, GHS)).not.toContain('₵-')
    })

    it('applies the same rule to other before-symbol currencies', () => {
      expect(formatAmountWithConfig(-99.5, USD)).toBe('-$99.50')
      expect(formatAmountWithConfig(-1, CURRENCIES.GBP)).toBe('-£1.00')
      expect(formatAmountWithConfig(-1, CURRENCIES.EUR)).toBe('-€1.00')
    })
  })

  describe("symbolPosition: 'after'", () => {
    it('renders a positive amount with the symbol trailing', () => {
      expect(formatAmountWithConfig(1200, XOF)).toBe('1,200 CFA')
    })

    it('puts the minus in front of the WHOLE string for a negative amount', () => {
      expect(formatAmountWithConfig(-1200, XOF)).toBe('-1,200 CFA')
      expect(formatAmountWithConfig(-1200, XAF)).toBe('-1,200 FCFA')
    })

    it('honours the 0-decimal config for after-symbol currencies', () => {
      expect(formatAmountWithConfig(-1200.6, XOF)).toBe('-1,201 CFA')
    })
  })

  describe('zero end of the range', () => {
    it('formats plain zero without a sign', () => {
      expect(formatAmountWithConfig(0, GHS)).toBe('GH₵0.00')
      expect(formatAmountWithConfig(0, XOF)).toBe('0 CFA')
    })

    it('treats null and undefined as zero', () => {
      expect(formatAmountWithConfig(null, GHS)).toBe('GH₵0.00')
      expect(formatAmountWithConfig(undefined, GHS)).toBe('GH₵0.00')
      expect(formatAmountWithConfig(null, XOF)).toBe('0 CFA')
    })

    it('does not render negative zero as "-GH₵0.00"', () => {
      expect(formatAmountWithConfig(-0, GHS)).toBe('GH₵0.00')
    })

    it('does not sign a tiny negative that rounds away to zero', () => {
      expect(formatAmountWithConfig(-0.001, GHS)).toBe('GH₵0.00')
      expect(formatAmountWithConfig(-0.4, XOF)).toBe('0 CFA')
    })

    it('still signs the smallest representable negative', () => {
      expect(formatAmountWithConfig(-0.01, GHS)).toBe('-GH₵0.01')
      expect(formatAmountWithConfig(-1, XOF)).toBe('-1 CFA')
    })
  })

  describe('overflow end of the range', () => {
    it('formats a 7-figure negative with grouped thousands', () => {
      expect(formatAmountWithConfig(-1234567.89, GHS)).toBe('-GH₵1,234,567.89')
      expect(formatAmountWithConfig(-1234567.89, USD)).toBe('-$1,234,567.89')
    })

    it('formats a 10-figure negative under both symbol positions', () => {
      expect(formatAmountWithConfig(-9876543210.55, USD)).toBe('-$9,876,543,210.55')
      expect(formatAmountWithConfig(-9876543210, XOF)).toBe('-9,876,543,210 CFA')
    })

    it('emits exactly one minus sign however large the amount', () => {
      const out = formatAmountWithConfig(-9876543210.55, GHS)
      expect(out.match(/-/g)).toHaveLength(1)
      expect(out.startsWith('-')).toBe(true)
    })
  })

  describe('includeSymbol: false', () => {
    it('returns the bare number for a positive amount', () => {
      expect(formatAmountWithConfig(1200, GHS, false)).toBe('1,200.00')
    })

    it('keeps the leading minus for a negative amount', () => {
      expect(formatAmountWithConfig(-1200, GHS, false)).toBe('-1,200.00')
      expect(formatAmountWithConfig(-1200, XOF, false)).toBe('-1,200')
    })

    it('never emits a currency symbol', () => {
      expect(formatAmountWithConfig(-1200, GHS, false)).not.toContain('₵')
      expect(formatAmountWithConfig(-1200, XOF, false)).not.toContain('CFA')
    })
  })
})

describe('accountStore currency formatting', () => {
  beforeEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT })
  })

  it('formatCurrency puts the minus before the symbol for the tenant currency', () => {
    useAccountStore.setState({ currencyConfig: GHS })
    expect(useAccountStore.getState().formatCurrency(-1200)).toBe('-GH₵1,200.00')
  })

  it('formatCurrency leads the whole string for an after-symbol tenant currency', () => {
    useAccountStore.setState({ currencyConfig: XOF })
    expect(useAccountStore.getState().formatCurrency(-1200)).toBe('-1,200 CFA')
  })

  it('formatCurrency still formats positives correctly after the fix', () => {
    useAccountStore.setState({ currencyConfig: GHS })
    expect(useAccountStore.getState().formatCurrency(1200)).toBe('GH₵1,200.00')
    useAccountStore.setState({ currencyConfig: XOF })
    expect(useAccountStore.getState().formatCurrency(1200)).toBe('1,200 CFA')
  })

  it('formatCurrencyValue keeps the minus and omits the symbol', () => {
    useAccountStore.setState({ currencyConfig: GHS })
    expect(useAccountStore.getState().formatCurrencyValue(-1200)).toBe('-1,200.00')
    expect(useAccountStore.getState().formatCurrencyValue(1200)).toBe('1,200.00')
  })

  it('defaults to USD formatting when no tenant currency is set', () => {
    expect(useAccountStore.getState().formatCurrency(-1200)).toBe('-$1,200.00')
  })
})
