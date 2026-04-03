import { Router } from "express";
import { validateQuery } from "@/middlewares/validate";
import { modelsControllers } from "@/modules/models/models.controller";
import { getAllModelsQuerySchema } from "@/modules/models/validators";

const modelsRoute = Router();

modelsRoute.get("/all", validateQuery(getAllModelsQuerySchema), modelsControllers.getAllModels);

export default modelsRoute;
