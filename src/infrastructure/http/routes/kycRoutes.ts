import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/authMiddleware";
import { KycController } from "../controllers/KycController";

const kycRouter = Router();
const controller = new KycController();

kycRouter.use(ensureAuthenticated);

kycRouter.post("/submit", controller.submit.bind(controller));
kycRouter.get("/status", controller.status.bind(controller));
kycRouter.post("/:id/approve", controller.approve.bind(controller));
kycRouter.post("/:id/reject", controller.reject.bind(controller));

export { kycRouter };

