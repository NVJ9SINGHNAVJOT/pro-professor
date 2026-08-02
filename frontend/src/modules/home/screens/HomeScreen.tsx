import { NavLink } from "react-router";
import GalaxyBackdrop from "@/modules/home/components/GalaxyBackdrop";
import { LAUNCHERS, SPIKE } from "@/modules/home/constants";

const professorName = import.meta.env.VITE_PROFESSOR_NAME;

const spikeFill = (accent: string) => `linear-gradient(to right, transparent, ${accent}, transparent)`;

/**
 * The galaxy landing page: a procedurally drawn spiral galaxy over which a small constellation of
 * launcher stars doubles as the app's navigation. It is the app's index route ("/").
 */
const HomeScreen = () => {
  return (
    <div className="relative flex min-h-full w-full items-center justify-center overflow-hidden bg-black">
      <GalaxyBackdrop />

      {/* Vignette so the center content stays legible. Kept light at the edges — that is where the
          disc's arms sweep past, and crushing it to black there hides the rotation. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.8) 100%)",
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
