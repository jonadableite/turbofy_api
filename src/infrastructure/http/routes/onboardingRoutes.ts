
import { Router } from "express";
import { OnboardingController } from "../controllers/OnboardingController";
import { ensureAuthenticated } from "../middlewares/authMiddleware";

const onboardingRouter = Router();
const controller = new OnboardingController();

onboardingRouter.use(ensureAuthenticated);

onboardingRouter.get("/status", controller.getStatus.bind(controller));
onboardingRouter.post("/personal-data", controller.updatePersonalData.bind(controller));
onboardingRouter.post("/address", controller.updateAddress.bind(controller));
onboardingRouter.post("/upload-url", controller.getUploadUrl.bind(controller));
onboardingRouter.post("/confirm-upload", controller.confirmUpload.bind(controller));
onboardingRouter.post("/complete", controller.complete.bind(controller));

export { onboardingRouter };
