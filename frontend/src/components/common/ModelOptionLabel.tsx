import type { ComponentType } from "react";
import { FileText, ImageIcon, Mic, Video } from "lucide-react";

const MODALITY_META: Record<string, { icon: ComponentType<{ size?: number }>; label: string; className: string }> = {
  text: { icon: FileText, label: "Text", className: "bg-neutral-700 text-neutral-300" },
  image: { icon: ImageIcon, label: "Image", className: "bg-violet-900/60 text-violet-300" },
  audio: { icon: Mic, label: "Audio", className: "bg-blue-900/60 text-blue-300" },
  video: { icon: Video, label: "Video", className: "bg-amber-900/60 text-amber-300" },
};

interface ModelOptionLabelProps {
  name: string;
  nameClassName?: string;
  modalities?: string[];
  providerLabel?: string;
  providerClassName?: string;
}

/** Row showing a provider badge, the model name, and badges for its accepted input types. */
export const ModelOptionLabel = ({
  name,
  nameClassName,
  modalities = [],
  providerLabel,
  providerClassName,
}: ModelOptionLabelProps) => (
  <span className="flex items-center gap-2">
    {providerLabel && (
      <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${providerClassName}`}>
        {providerLabel}
      </span>
    )}
    <span className={nameClassName}>{name}</span>
    <span className="flex items-center gap-1" aria-label="Supported input types">
      {modalities.map((mod) => {
        const meta = MODALITY_META[mod];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <span
            key={mod}
            title={meta.label}
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${meta.className}`}
          >
            <Icon size={10} />
            {meta.label}
          </span>
        );
      })}
    </span>
  </span>
);
