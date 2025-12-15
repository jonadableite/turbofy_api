import { CommissionRule } from '../../domain/commissions/CommissionRule';

export interface CommissionCalculationInput {
  amountCents: number;
  rules: CommissionRule[];
}

export interface CommissionSplitItem {
  ruleId: string;
  amountCents: number;
}

export const calculateCommissionSplit = (
  input: CommissionCalculationInput
): CommissionSplitItem[] => {
  const { amountCents, rules } = input;
  if (!rules.length || amountCents <= 0) return [];
  const ordered = [...rules]
    .filter((r) => r.active)
    .sort((a, b) => b.priority - a.priority);
  const result: CommissionSplitItem[] = [];
  for (const rule of ordered) {
    let value = 0;
    if (rule.type === 'PERCENTAGE') {
      value = Math.floor((amountCents * rule.value) / 100);
    } else if (rule.type === 'FIXED') {
      value = rule.value;
    }
    if (rule.maxAmountCents && value > rule.maxAmountCents) {
      value = rule.maxAmountCents;
    }
    if (value > 0) {
      result.push({ ruleId: rule.id, amountCents: value });
    }
  }
  return result;
};
