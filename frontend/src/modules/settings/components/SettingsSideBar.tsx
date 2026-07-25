import { HardDriveIcon, NotebookPenIcon } from "lucide-react";
import { NavLink } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const sections = [
  { label: "Notes", path: ROUTES.SETTINGS_NOTES, icon: NotebookPenIcon },
  { label: "Storage", path: ROUTES.SETTINGS_STORAGE, icon: HardDriveIcon },
] as const;

/**
 * The settings sidebar — same shape as the chat/notes sidebars (LeftNav header band on top,
 * navigation below), but with a fixed list of sections instead of a fetched, searchable one.
 */
const SettingsSideBar = () => {
  return (
    <aside className="z-40 flex h-full w-67.5 shrink-0 flex-col gap-y-2 overflow-hidden bg-chat-sidebar text-white">
      <LeftNav />
      {/* Shares the content pane's top bar height for a uniform top band */}
      <div className="flex h-11.5 shrink-0 items-center px-4">
        <span className="para-semibold">Settings</span>
      </div>

      <div className="flex flex-col gap-y-1 px-2">
        {sections.map((section) => (
          <NavLink
            key={section.label}
            to={section.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white",
                isActive && "bg-neutral-800 text-white",
              )
            }
          >
            <section.icon className="size-4.5 shrink-0" />
            <span className="truncate">{section.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
};

export default SettingsSideBar;
