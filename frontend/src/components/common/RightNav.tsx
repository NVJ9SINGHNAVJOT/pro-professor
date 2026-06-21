import { useState } from "react";
import { NavLink } from "react-router";
import { LayoutDashboardIcon, HomeIcon, MessageSquareIcon, SettingsIcon } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const name = import.meta.env.VITE_PROFESSOR_NAME;

const menuItems = [
  { label: "Home", path: ROUTES.HOME, icon: HomeIcon },
  { label: "Chat", path: ROUTES.CHAT, icon: MessageSquareIcon },
  { label: "Settings", path: ROUTES.SETTINGS, icon: SettingsIcon },
  { label: "Dashboard", path: ROUTES.DASHBOARD, icon: LayoutDashboardIcon },
] as const;

// Continuous stream of musical notes raining down the rail (position/timing in index.css).
const notes = ["♪", "♫", "♬", "♩", "♭", "♯", "♮"] as const;

const RightNav = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Persistent narrow rail: clicking anywhere on it opens the sidebar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-full w-16 shrink-0 cursor-pointer flex-col items-center py-3 text-white border-l border-neutral-800 bg-neutral-950 transition-colors hover:bg-neutral-900"
      >
        <img
          alt="Logo"
          src="/images/title-logo.webp"
          className="w-9 animate-music-float drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]"
        />
        {/* Falling musical notes */}
        <div aria-hidden className="relative mt-3 w-full flex-1 overflow-hidden">
          {notes.map((note, index) => (
            <span key={index} className="ct-note text-neutral-100 drop-shadow-[0_0_5px_rgba(255,255,255,0.35)]">
              {note}
            </span>
          ))}
        </div>
      </button>

      {/* Backdrop — closes the menu on an outside click */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sliding sidebar — overlays the content, never resizes the main screen */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-64 flex-col gap-y-2 border-l border-neutral-800 bg-neutral-950 p-3 text-white shadow-2xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center gap-x-5 px-1 py-1">
          <img
            alt="Logo"
            src="/images/title-logo.webp"
            className="w-9 shrink-0 animate-music-float drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]"
          />
          <span className="truncate bg-linear-to-br from-white to-neutral-400 bg-clip-text text-transparent para-medium-semibold tracking-wide">
            {name}
          </span>
        </div>

        <div className="mt-2 flex flex-col gap-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white",
                  isActive && "bg-neutral-800 text-white",
                )
              }
            >
              <item.icon className="size-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </aside>
    </>
  );
};

export default RightNav;
