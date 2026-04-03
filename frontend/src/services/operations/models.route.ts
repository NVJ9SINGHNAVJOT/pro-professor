import { createRoute } from "@/services/apiRoute";
import { BASE_URL_SERVER } from "@/services/apis";

const modelsEndPoints = {
  GET_ALL_MODELS: `${BASE_URL_SERVER}/models/all`,
};

export type ModelProvider = "ollama" | "ai-service";

export type ProviderModel = {
  name: string;
  provider: ModelProvider;
  role: string;
  version: string | null;
  isActive: boolean;
};

export type GetAllModelsResponse = {
  message: string;
  data: {
    models: ProviderModel[];
  };
};

export const modelsRoute = {
  getAllModels: createRoute<[], GetAllModelsResponse>(() => ({
    method: "GET",
    url: modelsEndPoints.GET_ALL_MODELS,
  })),
};
