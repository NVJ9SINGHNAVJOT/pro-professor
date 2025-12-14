import { NavLink } from "react-router-dom";

const name = import.meta.env.VITE_PROFESSOR_NAME;

const menuItems = [
  { label: "Home", path: "/" },
  { label: "Chat", path: "/chat" },
  { label: "Settings", path: "/settings" },
  { label: "Dashboard", path: "/dashboard" },
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
      <div className="absolute cursor-default right-5 h-[95%] flex items-center gap-x-2 para-medium bg-black px-4 rounded-xl border border-[#444444]">
        <div>{name}</div>
        <img alt="Logo" src="images/title-logo.webp" className="w-11.5 aspect-auto" />
      </div>
    </nav>
  );
};

export default MainNavbar;
