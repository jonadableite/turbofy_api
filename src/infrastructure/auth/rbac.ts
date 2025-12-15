import { Request, Response, NextFunction } from "express"

export type Role = "owner" | "admin" | "manager" | "support" | "coproducer" | "affiliate" | "buyer"

export interface PolicyContext {
  userId: string
  role: Role
  orgId?: string
}

const rolePermissions: Record<Role, string[]> = {
  owner: [
    "org.manage",
    "product.manage",
    "course.manage",
    "affiliate.manage",
    "commission.manage",
    "finance.view",
    "integration.manage"
  ],
  admin: ["product.manage", "course.manage", "affiliate.manage", "commission.manage", "finance.view"],
  manager: ["product.manage", "course.manage", "affiliate.manage", "commission.manage"],
  support: ["finance.view"],
  coproducer: ["product.manage", "course.manage"],
  affiliate: ["affiliate.view"],
  buyer: ["members.view"]
}

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = (req as any).auth as PolicyContext
    if (!ctx) {
      res.status(401).json({ error: "unauthorized" })
      return
    }
    const allowed = rolePermissions[ctx.role]?.includes(permission)
    if (!allowed) {
      res.status(403).json({ error: "forbidden" })
      return
    }
    next()
  }
}