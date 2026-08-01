import { MessageSquareIcon, NotebookPenIcon, WorkflowIcon, SettingsIcon } from "lucide-react";
import { ROUTES } from "@/constants/routes";

/** The clickable "stars" — each launches into a module. Accent tints its glow and icon. */
export const LAUNCHERS = [
  {
    label: "Chat",
    description: "Talk with your professor",
    to: ROUTES.CHAT,
    icon: MessageSquareIcon,
    accent: "#38bdf8",
  },
  { label: "Notes", description: "Write and link notes", to: ROUTES.NOTES, icon: NotebookPenIcon, accent: "#34d399" },
  {
    label: "Diagrams",
    description: "Design and edit diagrams",
    to: ROUTES.DIAGRAMS,
    icon: WorkflowIcon,
    accent: "#a78bfa",
  },
  {
    label: "Settings",
    description: "Tune your AI defaults",
    to: ROUTES.SETTINGS,
    icon: SettingsIcon,
    accent: "#fbbf24",
  },
] as const;

/** One arm of a launcher's diffraction cross; the pair grows and brightens on hover/focus. */
export const SPIKE =
  "absolute left-1/2 top-1/2 h-px w-24 -translate-x-1/2 -translate-y-1/2 opacity-60 transition-all duration-500 group-hover:w-36 group-hover:opacity-100 group-focus-visible:w-36 group-focus-visible:opacity-100";
