import { Outlet, useLocation } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import RouteProgress from "@/components/common/RouteProgress";
import { Toaster } from "@/components/common/toast";
import SocketProvider from "@/context/SocketProvider";

function App() {
  const { pathname } = useLocation();

  // chat/notes/diagrams/settings mount the LeftNav header inside their own sidebar;
  // every other screen gets the floating logo button instead
  const hasSidebarNav = /^\/(chat|notes|diagrams|settings)/.test(pathname);

  return (
    <SocketProvider>
      <RouteProgress />
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
