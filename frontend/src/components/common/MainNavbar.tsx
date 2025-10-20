import { NavLink } from "react-router-dom";

const menuItems = ["Home", "Dashboard"];

const MainNavbar = () => {
  return (
    <nav
      className={`bg-neutral-950 sticky z-[100] text-white top-0 px-2 lm:px-7 flex h-[3.8rem] w-full items-center 
        justify-between shadow-[inset_0px_-15px_20px_rgba(41,41,41,0.5)]
        `}
    >
      {/* Menu items */}
      <div className="flex gap-x-2 lm:gap-x-5">
        {menuItems.map((item, index) => {
          return (
            <NavLink
              key={index}
              className={({ isActive }) =>
                `ct-botton-elegante px-[10px] lm:px-[15px] py-[3px] lm:py-[5px] text-[0.85rem] lm:text-base ${
                  isActive ? "after:scale-[4] border-[#666666] bg-[#292929]" : ""
                } hover:after:scale-[4] hover:border-[#666666] hover:bg-[#292929]`
              }
              to={item === "Home" ? "/" : `/${item.toLowerCase()}`}
            >
              {item}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default MainNavbar;
