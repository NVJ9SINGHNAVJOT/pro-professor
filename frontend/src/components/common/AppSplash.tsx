const professorName = import.meta.env.VITE_PROFESSOR_NAME;

/**
 * The root route's `HydrateFallback`. The root loader runs before first paint, so without
 * this the initial load would be a blank page for the length of that request.
 */
const AppSplash = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-black">
    <span className="animate-pulse bg-linear-to-br from-white via-white to-neutral-500 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
      {professorName}
    </span>
  </div>
);

export default AppSplash;
