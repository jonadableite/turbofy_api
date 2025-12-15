import { Router } from "express"
import { InMemoryCommissionRuleRepository } from "../../adapters/repositories/InMemoryCommissionRuleRepository"
import { requirePermission } from "../../auth/rbac"
import { calculateCommissionSplit } from "../../../application/services/CommissionService"

const repo = new InMemoryCommissionRuleRepository()

export const commissionRouter = Router()

commissionRouter.post("/commission-rules", requirePermission("commission.manage"), async (req, res) => {
  const rule = await repo.createRule(req.body)
  res.json(rule)
})

commissionRouter.get("/commission-rules", requirePermission("commission.manage"), async (req, res) => {
  const { orgId, productId } = req.query as { orgId: string; productId?: string }
  const rules = await repo.listRules(orgId, productId)
  res.json(rules)
})

commissionRouter.post("/commission/calculate", requirePermission("commission.manage"), async (req, res) => {
  const { orgId, productId, amountCents } = req.body as { orgId: string; productId: string; amountCents: number }
  const rules = await repo.listRules(orgId, productId)
  const split = calculateCommissionSplit({ amountCents, rules })
  res.json({ split })
})