import { HardDriveIcon, MessageSquareIcon, NotebookPenIcon } from "lucide-react";
import { NavLink } from "react-router";
import MainNavbar from "@/components/common/MainNavbar";
import { SIDEBAR_STACK, SIDEBAR_SURFACE, SIDEBAR_WIDTH, sidebarNavRow } from "@/components/common/sidebar";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const sections = [
  { label: "Storage", path: ROUTES.SETTINGS_STORAGE, icon: HardDriveIcon },
  { label: "Chat", path: ROUTES.SETTINGS_CHAT, icon: MessageSquareIcon },
  { label: "Notes", path: ROUTES.SETTINGS_NOTES, icon: NotebookPenIcon },
] as const;

/**
 * The settings sidebar — same shape as the chat/notes sidebars (MainNavbar header band on top,
 * navigation below), but with a fixed list of sections instead of a fetched, searchable one. It
 * never collapses, so it is the shell's two elements folded into one.
 */
const SettingsSideBar = () => {
  return (
    <aside className={cn(SIDEBAR_SURFACE, SIDEBAR_STACK, SIDEBAR_WIDTH, "z-40")}>
      <MainNavbar />

      <div className="flex flex-col gap-y-1 px-2">
        {sections.map((section) => (
          <NavLink key={section.label} to={section.path} className={({ isActive }) => sidebarNavRow(isActive)}>
            <section.icon className="size-4.5 shrink-0" />
            <span className="truncate">{section.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
};

export default SettingsSideBar;
