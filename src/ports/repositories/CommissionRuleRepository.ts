import { CommissionRule } from "../../domain/commissions/CommissionRule";

export interface CommissionRuleRepository {
  createRule(input: Omit<CommissionRule, "id" | "createdAt" | "updatedAt">): Promise<CommissionRule>;
  listRules(merchantId: string, productId?: string): Promise<CommissionRule[]>;
  findById(id: string): Promise<CommissionRule | null>;
  update(rule: CommissionRule): Promise<CommissionRule>;
}