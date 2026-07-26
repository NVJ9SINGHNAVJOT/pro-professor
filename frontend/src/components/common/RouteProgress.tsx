import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

/**
 * Thin top bar shown while a route is loading.
 */
const RouteProgress = () => {
  const navigation = useNavigation();
  // Only trigger on actual route navigation, ignore background revalidations
  const busy = navigation.state !== "idle";

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (busy) {
      setVisible(true);
      setProgress(0);
      // Small delay to allow the 0% state to render before transitioning
      const timer = setTimeout(() => {
        setProgress(90);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setProgress(100);
      // Wait for the 100% transition and fade out before unmounting
      const timer = setTimeout(() => {
        setVisible(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [busy]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] bg-white/5">
      <div
        className="h-full rounded-r-full bg-linear-to-r from-transparent via-purple-500 to-sky-400"
        style={{
          width: `${progress}%`,
          boxShadow: "0 0 12px 1px rgba(168,85,247,0.7)",
          opacity: busy ? 1 : 0,
          transition: busy
            ? "width 10s cubic-bezier(0.05, 0.9, 0.1, 1)" // Slow down as it approaches 90%
            : "width 0.3s ease-in-out, opacity 0.3s ease-in-out 0.1s", // Snap to 100% and fade out
        }}
      />
    </div>
  );
};

export default RouteProgress;
