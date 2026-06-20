import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import RightNav from "@/components/common/RightNav";
import { Toaster } from "@/components/ui/sonner";
import SocketProvider from "@/context/SocketProvider";
import { useApi } from "@/hooks/useApi";
import { modelsRoute } from "@/services/operations/models/models.route";
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
      <Toaster
        theme="dark"
        toastOptions={{
          classNames: {
            title: "para-small-semibold",
            description: "para-small-regular",
          },
        }}
        style={
          {
            "--normal-bg": "oklch(0.205 0 0)",
            "--normal-text": "oklch(0.985 0 0)",
            "--normal-border": "oklch(1 0 0 / 10%)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
      />
    </SocketProvider>
  );
}

export default App;
