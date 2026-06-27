import { Router } from "express";
import userRouter from "./user";
import sessionRouter from "./session";
import googleRouter from "./google";
import upstoxRouter from "./upstox";
import binanceRouter from "./binance";

const router: Router = Router();

router.use("/", userRouter);
router.use("/", sessionRouter);
router.use("/", googleRouter);
router.use("/", upstoxRouter);
router.use("/", binanceRouter);

export default router;
