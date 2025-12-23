import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/authMiddleware";
import { RifeiroPixKeyController } from "../controllers/RifeiroPixKeyController";

const rifeiroPixKeyRouter = Router();
const controller = new RifeiroPixKeyController();

rifeiroPixKeyRouter.use(ensureAuthenticated);

// Rotas de chave Pix para Rifeiros (Merchant-based)
rifeiroPixKeyRouter.post("/", controller.register.bind(controller));
rifeiroPixKeyRouter.get("/", controller.get.bind(controller));
rifeiroPixKeyRouter.post("/verify", controller.verify.bind(controller));
rifeiroPixKeyRouter.post("/validate-transfeera", controller.validateWithTransfeera.bind(controller));

export { rifeiroPixKeyRouter };

