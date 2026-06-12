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
      <div className="h-screen w-screen bg-black">

        <main
          className={cn(
            "relative mx-auto w-full h-full",
            isChatRoute ? "overflow-hidden" : "min-w-minContent max-w-maxContent overflow-x-auto overflow-y-auto"
          )}
        >

          {!isChatRoute && <MainNavbar />}

          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}

export default App;
