import { NavLink } from "react-router";
import { MessageSquareIcon, NotebookPenIcon, WorkflowIcon, SettingsIcon } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import GalaxyBackdrop from "@/modules/home/components/GalaxyBackdrop";

const professorName = import.meta.env.VITE_PROFESSOR_NAME;

/** The clickable "stars" — each launches into a module. Accent tints its glow and icon. */
const LAUNCHERS = [
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
const SPIKE =
  "absolute left-1/2 top-1/2 h-px w-24 -translate-x-1/2 -translate-y-1/2 opacity-60 transition-all duration-500 group-hover:w-36 group-hover:opacity-100 group-focus-visible:w-36 group-focus-visible:opacity-100";

const spikeFill = (accent: string) => `linear-gradient(to right, transparent, ${accent}, transparent)`;

/**
 * The galaxy landing page: a procedurally drawn Milky Way over which a small constellation of
 * launcher stars doubles as the app's navigation. It is the app's index route ("/").
 */
const HomeScreen = () => {
  return (
    <div className="relative flex min-h-full w-full items-center justify-center overflow-hidden bg-black">
      <GalaxyBackdrop />

      {/* Vignette so the center content stays legible */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0.92) 100%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-14 px-6 py-24 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="caption-small-regular uppercase tracking-[0.3em] text-neutral-400">Welcome to</span>
          <h1 className="bg-linear-to-br from-white via-white to-neutral-500 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl">
            {professorName}
          </h1>
          <p className="max-w-md para-small-regular text-neutral-400">Your AI workspace — pick a star to begin.</p>
        </div>

        <nav className="flex flex-wrap items-start justify-center gap-x-8 gap-y-10">
          {LAUNCHERS.map((item, index) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className="group relative flex w-36 flex-col items-center gap-3 rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50"
              >
                <span
                  className="animate-orbit-float relative flex size-24 items-center justify-center"
                  style={{ animationDelay: `${index * 0.6}s` }}
                >
                  {/* Halo — the star's bloom, bleeding past the hit area */}
                  <span
                    aria-hidden
                    className="absolute -inset-6 opacity-70 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, ${item.accent}b3 0%, ${item.accent}40 22%, ${item.accent}12 40%, transparent 68%)`,
                    }}
                  />
                  {/* Diffraction spikes — the horizontal bar, and the same bar turned upright */}
                  <span aria-hidden className={SPIKE} style={{ background: spikeFill(item.accent) }} />
                  <span aria-hidden className={`${SPIKE} rotate-90`} style={{ background: spikeFill(item.accent) }} />
                  <Icon
                    className="relative size-7 text-white transition-transform duration-500 group-hover:scale-110 group-focus-visible:scale-110"
                    style={{ filter: `drop-shadow(0 0 4px #fff) drop-shadow(0 0 14px ${item.accent})` }}
                  />
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="para-small-medium text-white">{item.label}</span>
                  <span className="caption-small-regular text-neutral-400">{item.description}</span>
                </span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default HomeScreen;
