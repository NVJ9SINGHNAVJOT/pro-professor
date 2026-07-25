import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import { Toaster } from "@/components/common/toast";
import SocketProvider from "@/context/SocketProvider";
import { useApi } from "@/hooks/useApi";
import { modelsRoute } from "@/services/operations/models/models.route";
import { useAppDispatch } from "@/redux/store";
import { setModels } from "@/redux/slices/modelsSlice";

function App() {
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const { execute: fetchModels } = useApi(modelsRoute.getAllModels);

  // chat/notes/diagrams/settings mount the LeftNav header inside their own sidebar;
  // every other screen gets the floating logo button instead
  const hasSidebarNav = /^\/(chat|notes|diagrams|settings)/.test(pathname);

  useEffect(() => {
    (async () => {
      const res = await fetchModels();
      if (!res.error) dispatch(setModels(res.response.data.models));
      else dispatch(setModels([]));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SocketProvider>
      <div className="flex h-screen w-screen bg-black">
        <main className="relative w-full flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto">
          <Outlet />
        </main>

        {!hasSidebarNav && <LeftNav floating />}
      </div>
      <Toaster />
    </SocketProvider>
  );
}

export default App;
