import { NextFunction, Request, Response } from "express";

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

    const hasRole = req.user.roles?.some((role) => roles.includes(role));
    if (!hasRole) {
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


