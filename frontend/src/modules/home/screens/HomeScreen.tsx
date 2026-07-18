import { NavLink } from "react-router";
import { MessageSquareIcon, NotebookPenIcon, WorkflowIcon, SettingsIcon } from "lucide-react";
import { ROUTES } from "@/constants/routes";

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

/**
 * The galaxy landing page: a drifting Milky-Way backdrop over which a small constellation of glowing
 * orbs doubles as the app's launcher. It is the app's index route ("/").
 */
const HomeScreen = () => {
  return (
    <div className="relative flex min-h-full w-full items-center justify-center overflow-hidden bg-black">
      {/* Nebula glow — a large, slowly rotating field of colored light */}
      <div
        aria-hidden
        className="animate-galaxy-spin pointer-events-none absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] opacity-70"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.18), transparent 40%)," +
            "radial-gradient(circle at 32% 62%, rgba(168,85,247,0.16), transparent 45%)," +
            "radial-gradient(circle at 68% 36%, rgba(56,189,248,0.14), transparent 45%)",
        }}
      />

      {/* Parallax star layers */}
      <div aria-hidden className="ct-starfield" />
      <div aria-hidden className="ct-starfield ct-starfield--near" />

      {/* Vignette so the center content stays legible */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)" }}
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
                className="group relative flex w-36 flex-col items-center gap-3 rounded-2xl outline-none"
              >
                <span
                  className="animate-orbit-float relative flex size-24 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110"
                  style={{
                    boxShadow: `0 0 0 1px ${item.accent}22, 0 0 32px -8px ${item.accent}`,
                    animationDelay: `${index * 0.6}s`,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full opacity-40 transition-opacity duration-300 group-hover:opacity-90"
                    style={{ background: `radial-gradient(circle at 30% 30%, ${item.accent}66, transparent 70%)` }}
                  />
                  <Icon
                    className="relative size-9 text-white"
                    style={{ filter: `drop-shadow(0 0 6px ${item.accent})` }}
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
