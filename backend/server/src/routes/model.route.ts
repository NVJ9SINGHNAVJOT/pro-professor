import { Router } from "express";
import { allModels } from "@/controllers/model.controller";

const modelRoute = Router();

modelRoute.get("/all", allModels);

export default modelRoute;
