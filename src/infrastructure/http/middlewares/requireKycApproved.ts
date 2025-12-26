import { Request, Response, NextFunction } from "express";
import { KycStatus } from "../../../domain/entities/KycStatus";
import { hasRole } from "../../../utils/roles";

const ALLOWED_PATHS = ["/me", "/auth", "/kyc", "/support"];

export const requireKycApproved = (req: Request, res: Response, next: NextFunction) => {
  if (ALLOWED_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  if (hasRole(req.user?.role, ["ADMIN", "OWNER"])) {
    return next();
  }

  if (req.user?.kycStatus !== KycStatus.APPROVED) {
    return res.status(423).json({
      code: "KYC_REQUIRED",
      message: "Sua conta ainda nao foi verificada.",
    });
  }

  return next();
};

