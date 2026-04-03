import { Request } from "express";
import { modelsProviders } from "@/modules/models/models.providers";
import { ProviderModel } from "@/modules/models/types";
import { GetAllModelsQuery } from "@/modules/models/validators";

const getAllModels = async (req: Request, _query: GetAllModelsQuery): Promise<ProviderModel[]> => {
  const results = await Promise.allSettled([
    modelsProviders.getOllamaModels(req),
    modelsProviders.getAiServiceModels(req),
  ]);

  const allModels = [
    ...(results[0].status === "fulfilled" ? results[0].value : []),
    ...(results[1].status === "fulfilled" ? results[1].value : []),
  ];

  if (allModels.length === 0) {
    throw new Error("Unable to fetch models from Ollama and AI Service.");
  }

  return allModels.sort((left, right) => {
    const providerCompare = left.provider.localeCompare(right.provider);
    if (providerCompare !== 0) return providerCompare;
    return left.name.localeCompare(right.name);
  });
};

export const modelsServices = {
  getAllModels,
};
