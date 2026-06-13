import { Outlet } from "react-router-dom";
import MainNavbar from "@/components/common/MainNavbar";
import SocketProvider from "@/context/SocketProvider";

function App() {
  return (
    <SocketProvider>
      <div className="flex h-screen w-screen flex-col bg-black">
        <MainNavbar />

        <main className="relative mx-auto w-full flex-1 min-h-0 min-w-minContent max-w-maxContent overflow-x-auto overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}

export default App;
