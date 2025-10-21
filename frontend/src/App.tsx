import { Outlet } from "react-router-dom";
import MainNavbar from "@/components/common/MainNavbar";

function App() {
  return (
    // wrapper
    <div className="h-screen w-screen bg-black">
      {/* ===== all pages will be rendered below ===== */}
      <main className="relative mx-auto w-full h-full min-w-minContent max-w-maxContent overflow-y-auto overflow-x-hidden">
        {/* ===== main nav bar ===== */}
        <MainNavbar />
        {/* All Pages */}
        <Outlet />
      </main>
    </div>
  );
}

export default App;
