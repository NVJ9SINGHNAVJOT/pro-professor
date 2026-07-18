import { useState } from "react";
import { NavLink } from "react-router";
import { HomeIcon, MessageSquareIcon, NotebookPenIcon, SettingsIcon, WorkflowIcon } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const name = import.meta.env.VITE_PROFESSOR_NAME;

const menuItems = [
  { label: "Home", path: ROUTES.HOME, icon: HomeIcon },
  { label: "Chat", path: ROUTES.CHAT, icon: MessageSquareIcon },
  { label: "Notes", path: ROUTES.NOTES, icon: NotebookPenIcon },
  { label: "Diagrams", path: ROUTES.DIAGRAMS, icon: WorkflowIcon },
  { label: "Settings", path: ROUTES.SETTINGS, icon: SettingsIcon },
] as const;

// Continuous stream of musical notes raining behind the logo (position/timing in index.css).
const notes = ["♪", "♫", "♬", "♩", "♭", "♯", "♮"] as const;

interface LeftNavProps {
  /**
   * Floating mode: a small fixed logo button at the top-left, for screens that
   * have no sidebar of their own (home/settings). Default mode is the
   * sidebar header block the module sidebars mount at their top.
   */
  floating?: boolean;
}

/**
 * The app menu. The logo lives at the top-left — as the header band of each
 * module sidebar (chat/notes/diagrams), with the musical notes drifting left
 * to right behind it — and clicking it slides the navigation drawer in from
 * the left.
 */
const LeftNav = ({ floating }: LeftNavProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {floating ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="fixed left-3 top-3 z-30 flex size-11 cursor-pointer items-center justify-center rounded-xl border border-neutral-800 bg-chat-sidebar transition-colors hover:bg-neutral-900"
        >
          <img
            alt="Logo"
            src="/images/title-logo.webp"
            className="w-8 animate-music-float drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="relative flex h-16 w-full shrink-0 cursor-pointer items-center border-b border-neutral-800 px-3 text-white transition-colors hover:bg-neutral-900"
        >
          {/* Musical notes drift left to right behind the logo */}
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            {notes.map((note, index) => (
              <span key={index} className="ct-note text-neutral-100 drop-shadow-[0_0_5px_rgba(255,255,255,0.35)]">
                {note}
              </span>
            ))}
          </div>
          <img
            alt="Logo"
            src="/images/title-logo.webp"
            className="relative w-9 animate-music-float drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]"
          />
        </button>
      )}

      {/* Backdrop — closes the menu on an outside click */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sliding menu — overlays from the left, never resizes the main screen */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-67.5 flex-col gap-y-2 border-r border-neutral-800 bg-chat-sidebar p-3 text-white shadow-2xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
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

export default LeftNav;
