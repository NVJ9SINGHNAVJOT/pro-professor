import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/hooks/useApi";
import { modelsRoute, type ModelProvider, type ProviderModel } from "@/services/operations/models.route";

export interface SelectedModel {
  provider: ModelProvider;
  model: string;
}

interface ModelSelectorProps {
  value: SelectedModel | null;
  onChange: (value: SelectedModel) => void;
  disabled?: boolean;
}

const SEPARATOR = "::";
const encode = (provider: string, name: string) => `${provider}${SEPARATOR}${name}`;

const ModelSelector = ({ value, onChange, disabled }: ModelSelectorProps) => {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const { execute: fetchModels } = useApi(modelsRoute.getAllModels);

  useEffect(() => {
    (async () => {
      const res = await fetchModels();
      if (!res.error) {
        setModels(res.response.data.models);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = value ? encode(value.provider, value.model) : undefined;

  const handleChange = (encoded: string) => {
    const idx = encoded.indexOf(SEPARATOR);
    const provider = encoded.slice(0, idx) as ModelProvider;
    const model = encoded.slice(idx + SEPARATOR.length);
    onChange({ provider, model });
  };

  return (
    <Select value={current} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className="text-white border-neutral-700 bg-neutral-800">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent className="bg-neutral-900 text-white border-neutral-700">
        {models.map((m) => (
          <SelectItem key={encode(m.provider, m.name)} value={encode(m.provider, m.name)}>
            {`${m.name} (${m.provider})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
