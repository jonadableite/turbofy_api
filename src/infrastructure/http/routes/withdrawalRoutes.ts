import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/authMiddleware";
import { requireKycApproved } from "../middlewares/requireKycApproved";
import { WithdrawalController } from "../controllers/WithdrawalController";

const withdrawalRouter = Router();
const controller = new WithdrawalController();

withdrawalRouter.use(ensureAuthenticated, requireKycApproved);

withdrawalRouter.post("/", controller.create.bind(controller));
withdrawalRouter.get("/:id", controller.get.bind(controller));
withdrawalRouter.get("/", controller.history.bind(controller));
withdrawalRouter.post("/:id/process", controller.process.bind(controller));

export { withdrawalRouter };

