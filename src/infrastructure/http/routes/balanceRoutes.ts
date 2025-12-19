import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/authMiddleware";
import { requireKycApproved } from "../middlewares/requireKycApproved";
import { BalanceController } from "../controllers/BalanceController";

const balanceRouter = Router();
const controller = new BalanceController();

balanceRouter.use(ensureAuthenticated, requireKycApproved);
balanceRouter.get("/", controller.get.bind(controller));

export { balanceRouter };

