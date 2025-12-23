import { Request, Response } from "express";
import { z } from "zod";
import { RegisterPixKeyUseCase } from "../../../application/useCases/pixKey/RegisterPixKeyUseCase";
import { VerifyPixKeyUseCase } from "../../../application/useCases/pixKey/VerifyPixKeyUseCase";
import { PrismaUserPixKeyRepository } from "../../database/PrismaUserPixKeyRepository";
import { logger } from "../../logger";

const pixKeyRepository = new PrismaUserPixKeyRepository();
const registerPixKey = new RegisterPixKeyUseCase(pixKeyRepository);
const verifyPixKey = new VerifyPixKeyUseCase(pixKeyRepository);

const registerSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  key: z.string(),
});

export class PixKeyController {
  async register(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const input = registerSchema.parse(req.body);
      const result = await registerPixKey.execute({
        userId,
        type: input.type,
        key: input.key,
      });
      return res.status(201).json(result);
    } catch (error) {
      logger.error({ error }, "Error registering pix key");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.issues });
      }
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const result = await verifyPixKey.execute({ userId });
      return res.json(result);
    } catch (error) {
      logger.error({ error }, "Error verifying pix key");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const pixKey = await pixKeyRepository.findByUserId(userId);
      return res.json(pixKey);
    } catch (error) {
      logger.error({ error }, "Error fetching pix key");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}

