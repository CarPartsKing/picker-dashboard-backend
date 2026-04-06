import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pickersRouter from "./pickers";
import picksRouter from "./picks";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pickersRouter);
router.use(picksRouter);
router.use(analyticsRouter);

export default router;
