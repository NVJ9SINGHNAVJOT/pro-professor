import { Outlet, useLocation } from "react-router-dom";
import MainNavbar from "@/components/common/MainNavbar";
import SocketProvider from "@/context/SocketProvider";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";

function App() {
  const { pathname } = useLocation();
  const isChatRoute = pathname === ROUTES.CHAT || pathname.startsWith(`${ROUTES.CHAT}/`);

  return (
    <SocketProvider>
      <div className="flex h-screen w-screen flex-col bg-black">
        <MainNavbar />

        <main
          className={cn(
            "relative mx-auto w-full flex-1 min-h-0",
            isChatRoute ? "overflow-hidden" : "min-w-minContent max-w-maxContent overflow-x-auto overflow-y-auto"
          )}
        >
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}

export default App;

