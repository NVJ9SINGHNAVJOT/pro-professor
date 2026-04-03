export type ModelProvider = "ollama" | "ai-service";

export type ProviderModel = {
  name: string;
  provider: ModelProvider;
  role: string;
  version: string | null;
  isActive: boolean;
};

export type AiServiceModelSource = "downloaded" | "custom";

export type AiServiceModel = {
  name: string;
  repo_id: string;
  source: AiServiceModelSource;
  path: string;
  loadable: boolean;
  size_mb: number;
  created_at: string;
  updated_at: string;
};

export type AiServiceModelsResponse = {
  success: boolean;
  message: string;
  data: AiServiceModel[];
};

export type OllamaModelDetails = {
  parent_model: string;
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
};

export type OllamaModel = {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
};

export type OllamaModelsResponse = {
  models: OllamaModel[];
};
