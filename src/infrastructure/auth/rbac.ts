import { NextFunction, Request, Response } from "express"

const ROLES = ["owner", "admin", "manager", "support", "coproducer", "affiliate", "buyer"] as const

export type Role = (typeof ROLES)[number]

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

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value)

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = req.auth
    if (ctx && isRole(ctx.role)) {
      const allowed = rolePermissions[ctx.role]?.includes(permission)
      if (!allowed) {
        res.status(403).json({ error: "forbidden" })
        return
      }
      next()
      return
    }

    if (!req.user) {
      res.status(401).json({ error: "unauthorized" })
      return
    }

    const allowed = (req.user.roles ?? []).some((role) => {
      const normalizedRole = role.toLowerCase()
      if (!isRole(normalizedRole)) return false
      return rolePermissions[normalizedRole]?.includes(permission)
    })

    if (!allowed) {
      res.status(403).json({ error: "forbidden" })
      return
    }

    next()
  }
}
