import { NextFunction, Request, Response } from "express";
import { hasRole } from "../../../utils/roles";

export const requireRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        },
      });
    }

    // req.user.role é uma string com roles separados por vírgula (ex: "OWNER,ADMIN")
    if (!hasRole(req.user.role, roles)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permissions",
        },
      });
    }

    return next();
  };
};

