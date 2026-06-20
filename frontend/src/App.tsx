import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import RightNav from "@/components/common/RightNav";
import { Toaster } from "@/components/ui/sonner";
import SocketProvider from "@/context/SocketProvider";
import { useApi } from "@/hooks/useApi";
import { modelsRoute } from "@/services/operations/models.route";
import { useAppDispatch } from "@/redux/store";
import { setModels } from "@/redux/slices/modelsSlice";

function App() {
  const dispatch = useAppDispatch();
  const { execute: fetchModels } = useApi(modelsRoute.getAllModels);

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

        <RightNav />
      </div>
      <Toaster />
    </SocketProvider>
  );
}

export default App;
