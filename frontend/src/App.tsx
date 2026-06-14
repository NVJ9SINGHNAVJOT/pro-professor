import { Outlet } from "react-router-dom";
import RightNav from "@/components/common/RightNav";
import SocketProvider from "@/context/SocketProvider";

function App() {
  return (
    <SocketProvider>
      <div className="flex h-screen w-screen bg-black">
        <main className="relative w-full flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto">
          <Outlet />
        </main>

        <RightNav />
      </div>
    </SocketProvider>
  );
}

export default App;
