import { z } from "zod";
import { ReconciliationType } from "../../../domain/entities/Reconciliation";

export const CreateReconciliationRequestSchema = z.object({
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  startDate: z.string().datetime("startDate must be a valid ISO datetime"),
  endDate: z.string().datetime("endDate must be a valid ISO datetime"),
  type: z.nativeEnum(ReconciliationType),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  {
    message: "endDate must be after startDate",
    path: ["endDate"],
  }
);

