import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import RouteProgress from "@/components/common/RouteProgress";
import SearchModal from "@/components/common/SearchModal";
import { Toaster } from "@/components/common/toast";
import SocketProvider from "@/context/SocketProvider";

function App() {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  // chat/notes/diagrams/settings mount the LeftNav header inside their own sidebar;
  // every other screen gets the floating logo button instead
  const hasSidebarNav = /^\/(chat|notes|diagrams|settings)/.test(pathname);

  /* Search lives at the root so ⌘K reaches it from any screen — the sidebars no longer carry
   * their own inputs. (⌘Space would have been the obvious binding, but macOS gives that to
   * Spotlight and the browser never sees it.) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SocketProvider>
      <RouteProgress />
      <div className="flex h-screen w-screen bg-black">
        <main className="relative w-full flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto">
          <Outlet />
        </main>

        {!hasSidebarNav && <LeftNav floating />}
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toaster />
    </SocketProvider>
  );
}

export default App;
