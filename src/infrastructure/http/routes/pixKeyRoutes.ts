import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/authMiddleware";
import { requireKycApproved } from "../middlewares/requireKycApproved";
import { PixKeyController } from "../controllers/PixKeyController";

const pixKeyRouter = Router();
const controller = new PixKeyController();

pixKeyRouter.use(ensureAuthenticated, requireKycApproved);

pixKeyRouter.post("/", controller.register.bind(controller));
pixKeyRouter.get("/", controller.get.bind(controller));
pixKeyRouter.post("/verify", controller.verify.bind(controller));

export { pixKeyRouter };

