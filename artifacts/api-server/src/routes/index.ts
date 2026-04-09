import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pickersRouter from "./pickers";
import picksRouter from "./picks";
import analyticsRouter from "./analytics";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pickersRouter);
router.use(picksRouter);
router.use(analyticsRouter);
router.use(dashboardRouter);

export default router;
