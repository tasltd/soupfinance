/**
 * Added (SOUPFIN-190): runtime schemas for finance report responses.
 *
 * The cash flow schema describes GET /rest/financeReports/cashFlowStatement.json
 * (contract: plans/soupfin-190-cash-flow-statement-backend.md). It is lenient on
 * shape (money as number or numeric string, missing lists, extra keys) because
 * normalizeCashFlowStatement() fills those gaps. It is strict on the one value
 * the old client-side statement got wrong: the opening cash balance must be a
 * real number, never a silent 0.
 */
import { z } from 'zod';

/** A money value: a number, or a numeric string from a BigDecimal. Anything else fails. */
export const moneySchema = z.union([
  z.number(), // Zod 4 already rejects NaN and Infinity
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'not a number')
    .transform((v) => Number(v)),
]);

/** A money value that may be absent; the normaliser derives it. */
const optionalMoney = moneySchema.nullish();

export const cashFlowActivitySchema = z.looseObject({
  description: z.string().nullish(),
  amount: moneySchema,
  ledgerGroup: z.string().nullish(),
  ledgerAccountId: z.string().nullish(),
  ledgerAccountName: z.string().nullish(),
  transactionDate: z.string().nullish(),
});

const activityList = z.array(cashFlowActivitySchema).nullish();

export const cashFlowStatementResponseSchema = z.looseObject({
  periodStart: z.string().nullish(),
  periodEnd: z.string().nullish(),
  beginningCashBalance: moneySchema,
  endingCashBalance: optionalMoney,
  operatingActivities: activityList,
  totalOperatingCashFlow: optionalMoney,
  investingActivities: activityList,
  totalInvestingCashFlow: optionalMoney,
  financingActivities: activityList,
  totalFinancingCashFlow: optionalMoney,
  netCashFlow: optionalMoney,
  error: z.string().nullish(),
});

export type CashFlowStatementResponse = z.infer<typeof cashFlowStatementResponseSchema>;
export type CashFlowActivityResponse = z.infer<typeof cashFlowActivitySchema>;
