import { useLoaderData } from "react-router";
import SettingsScreen from "@/modules/settings/screens/SettingsScreen";
import NotesSettingsPanel from "@/modules/settings/components/NotesSettingsPanel";
import ChatSettingsPanel from "@/modules/settings/components/ChatSettingsPanel";
import StoragePanel from "@/modules/settings/components/StoragePanel";
import type { SettingsLoaderData, StorageLoaderData } from "@/pages/settings/loader";

export default function SettingsLayout() {
  return <SettingsScreen />;
}

export function SettingsNotesPage() {
  const { settings } = useLoaderData<SettingsLoaderData>();
  return settings ? <NotesSettingsPanel initial={settings.notes} chat={settings.chat} /> : null;
}

export function SettingsChatPage() {
  const { settings } = useLoaderData<SettingsLoaderData>();
  return settings ? <ChatSettingsPanel initial={settings.chat} notes={settings.notes} /> : null;
}

export function SettingsStoragePage() {
  const { media, pagination } = useLoaderData<StorageLoaderData>();
  return <StoragePanel initialMedia={media} initialPagination={pagination} />;
}
