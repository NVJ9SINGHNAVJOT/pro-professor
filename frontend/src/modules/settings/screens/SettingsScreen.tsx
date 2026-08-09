import { Outlet } from "react-router";
import SettingsSideBar from "@/modules/settings/components/SettingsSideBar";

/** The settings shell: a fixed section sidebar plus the section named in the URL. */
const SettingsScreen = () => {
  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      <SettingsSideBar />
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        {/* One container for every section, so the content column never shifts between them */}
        <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-6">
          <Outlet />
        </div>
      </section>
    </div>
  );
};

export default SettingsScreen;
