import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const modelsEndPoints = {
  GET_ALL_MODELS: `${BASE_URL_SERVER}/models/all`,
  LOAD_MODEL: `${BASE_URL_SERVER}/models/load`,
};

export type ModelProvider = "ollama" | "ai-service";

export type ProviderModel = {
  name: string;
  provider: ModelProvider;
  role: string;
  version: string | null;
  isActive: boolean;
  inputModalities: string[];
  maxContextTokens: number | null;
  supportsThinking: boolean;
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

  loadModel: createRoute<[name: string], { message: string }>((name) => ({
    method: "POST",
    url: modelsEndPoints.LOAD_MODEL,
    data: { name },
  })),
};
