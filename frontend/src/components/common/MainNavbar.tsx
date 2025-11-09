import { NavLink } from "react-router-dom";

const menuItems = [
  { label: "Home", path: "/" },
  { label: "Chat", path: "/chat" },
  { label: "Settings", path: "/settings" },
  { label: "Dashboard", path: "/dashboard" },
] as const;

const MainNavbar = () => {
  return (
    <nav
      className={`bg-neutral-950 sticky z-100 text-white top-0 px-2 flex h-[55px] w-full items-center 
        justify-center shadow-[inset_0px_-15px_20px_rgba(41,41,41,0.5)]`}
    >
      {/* Menu items */}
      <div className="flex gap-x-16">
        {menuItems.map((item, index) => (
          <NavLink
            key={index}
            to={item.path}
            className={({ isActive }) =>
              `ct-button-elegante px-2.5! py-[3px]! ${
                isActive ? "after:scale-[4] border-[#666666] bg-[#292929]" : ""
              } hover:after:scale-[4] hover:border-[#666666] hover:bg-[#292929]`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MainNavbar;
