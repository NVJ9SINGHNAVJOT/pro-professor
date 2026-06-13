import { NavLink } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

const name = import.meta.env.VITE_PROFESSOR_NAME;

const menuItems = [
  { label: "Home", path: ROUTES.HOME },
  { label: "Chat", path: ROUTES.CHAT },
  { label: "Settings", path: ROUTES.SETTINGS },
  { label: "Dashboard", path: ROUTES.DASHBOARD },
] as const;

const MainNavbar = () => {
  return (
    <nav
      className="sticky top-0 z-50 flex w-full h-[55px] items-center justify-center bg-neutral-950 px-5
    text-white shadow-[inset_0px_-15px_20px_rgba(41,41,41,0.5)]"
    >
      <div className="flex gap-x-12 para-regular">
        {menuItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.path}
            className={({ isActive }) =>
              [
                "ct-button-elegante",
                "hover:border-[#666666] hover:bg-[#292929]",
                isActive && "border-[#666666] bg-[#292929] ct-active",
              ]
                .filter(Boolean)
                .join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="group absolute right-5 flex h-[75%] cursor-default items-center gap-x-3 rounded-full animate-glow bg-neutral-900/60 px-4 py-1.5 backdrop-blur-md transition-all duration-300 hover:bg-neutral-800 border border-neutral-800">
        <div className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-transparent para-medium-semibold tracking-wide">
          {name}
        </div>
        <img 
          alt="Logo" 
          src="/images/title-logo.webp" 
          className="w-10 animate-music-float drop-shadow-[0_0_5px_rgba(255,255,255,0.2)] transition-transform duration-500 group-hover:scale-110" 
        />
      </div>
    </nav>
  );
};

export default MainNavbar;
