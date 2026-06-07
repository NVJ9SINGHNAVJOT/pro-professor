import { Outlet } from "react-router-dom";
import MainNavbar from "@/components/common/MainNavbar";
import SocketProvider from "@/context/SocketProvider";

function App() {
  return (
    // wrapper — SocketProvider holds the single app-wide WebSocket connection
    <SocketProvider>
      <div className="h-screen w-screen bg-black">
        {/* ===== All pages will be rendered below ===== */}
        <main className="relative mx-auto w-full h-full min-w-minContent max-w-maxContent overflow-x-auto overflow-y-auto">
          {/* ===== Main nav bar ===== */}
          <MainNavbar />
          {/* All Pages */}
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}

export default App;
