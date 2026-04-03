import { Request, Response } from "express";
import { modelsServices } from "@/modules/models/models.service";
import { internalErrRes } from "@/utils/error";
import { GetAllModelsQuery } from "@/modules/models/validators";
import { successRes } from "@/utils/response";

const getAllModels = async (req: Request, res: Response): Promise<Response> => {
  try {
    const data = req.query as GetAllModelsQuery;
    const models = await modelsServices.getAllModels(req, data);

    return successRes(req, res, 200, "Models fetched successfully.", {
      models,
    });
  } catch (error) {
    return internalErrRes(req, res, error);
  }
};

export const modelsControllers = {
  getAllModels,
};
