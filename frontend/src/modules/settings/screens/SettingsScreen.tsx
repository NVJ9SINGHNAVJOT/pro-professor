import { Navigate, useParams } from "react-router";
import { ROUTES } from "@/constants/routes";
import SettingsSideBar from "@/modules/settings/components/SettingsSideBar";
import NotesSettingsPanel from "@/modules/settings/components/NotesSettingsPanel";
import StoragePanel from "@/modules/settings/components/StoragePanel";

const renderSection = (section: string | undefined) => {
  switch (section) {
    case "notes":
      return <NotesSettingsPanel />;
    case "storage":
      return <StoragePanel />;
    default:
      return null;
  }
};

/** The settings shell: a fixed section sidebar plus the section named in the URL. */
const SettingsScreen = () => {
  const section = useParams().section;
  const panel = renderSection(section);

  if (!panel) {
    return <Navigate to={ROUTES.SETTINGS_NOTES} replace />;
  }

  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      <SettingsSideBar />
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        {/* One container for every section, so the content column never shifts between them */}
        <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-6">{panel}</div>
      </section>
    </div>
  );
};

export default SettingsScreen;
