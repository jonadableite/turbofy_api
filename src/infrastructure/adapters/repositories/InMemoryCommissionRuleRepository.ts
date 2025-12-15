import { CommissionRule } from '../../../domain/commissions/CommissionRule';
import { CommissionRuleRepository } from '../../../ports/repositories/CommissionRuleRepository';

export class InMemoryCommissionRuleRepository
  implements CommissionRuleRepository
{
  private rules: CommissionRule[] = [];

  async createRule(
    input: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<CommissionRule> {
    const now = new Date();
    const rule: CommissionRule = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.rules.push(rule);
    return rule;
  }

  async listRules(
    merchantId: string,
    productId?: string
  ): Promise<CommissionRule[]> {
    return this.rules.filter(
      (r) =>
        r.merchantId === merchantId &&
        (!productId || r.productId === productId)
    );
  }

  async findById(id: string): Promise<CommissionRule | null> {
    return this.rules.find((r) => r.id === id) || null;
  }

  async update(rule: CommissionRule): Promise<CommissionRule> {
    const index = this.rules.findIndex((r) => r.id === rule.id);
    if (index === -1) throw new Error('Rule not found');
    this.rules[index] = { ...rule, updatedAt: new Date() };
    return this.rules[index];
  }
}
