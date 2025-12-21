import { useAppSelector } from "@/redux/store";
import { EditIcon, SearchIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

const menuList = [
  {
    name: "New chat",
    icon: <EditIcon />,
  },
  {
    name: "Search chats",
    icon: <SearchIcon />,
  },
];

const SideBar = () => {
  const history = useAppSelector((state) => state.chat.history);
  return (
    <section className="text-white w-67.5 bg-grey-50 overflow-y-auto">
      {/* Menu section */}
      <div className="flex flex-col mt-4">
        {menuList.map((item) => {
          return (
            <div
              key={item.name}
              className="flex gap-x-3 rounded-lg cursor-pointer items-center mx-2 px-2 py-2 hover:bg-neutral-700"
            >
              <div className="*:size-4.5">{item.icon}</div>
              <div className="para-small-medium">{item.name}</div>
            </div>
          );
        })}
      </div>
      {/* Chat section */}
      <div className="flex flex-col mt-4">
        <div className="text-neutral-400 mx-2 px-2">Chats</div>
        <div className="flex flex-col mt-2">
          {history.map((chat) => {
            return (
              <NavLink key={chat.id} to={`/chat/${chat.id}`}>
                <div className="rounded-lg para-small-medium cursor-pointer items-center mx-2 px-2 py-2 hover:bg-neutral-700">
                  {chat.title}
                </div>
              </NavLink>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SideBar;
