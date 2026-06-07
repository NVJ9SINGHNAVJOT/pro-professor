import { useEffect } from "react";
import { EditIcon, SearchIcon } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { setHistory } from "@/redux/slices/chatSlice";
import { useApi } from "@/hooks/useApi";
import { chatsRoute } from "@/services/operations/chats.route";
import { ROUTES } from "@/constants/routes";

const SideBar = () => {
  const history = useAppSelector((state) => state.chat.history);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { execute: fetchConversations } = useApi(chatsRoute.getConversations);

  useEffect(() => {
    (async () => {
      const res = await fetchConversations();
      if (!res.error) {
        dispatch(setHistory(res.response.data.conversations));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="text-white w-67.5 bg-grey-50 overflow-y-auto">
      {/* Menu section */}
      <div className="flex flex-col mt-4">
        <div
          onClick={() => navigate(ROUTES.CHAT)}
          className="flex gap-x-3 rounded-lg cursor-pointer items-center mx-2 px-2 py-2 hover:bg-neutral-700"
        >
          <div className="*:size-4.5">
            <EditIcon />
          </div>
          <div className="para-small-medium">New chat</div>
        </div>
        <div className="flex gap-x-3 rounded-lg cursor-pointer items-center mx-2 px-2 py-2 hover:bg-neutral-700">
          <div className="*:size-4.5">
            <SearchIcon />
          </div>
          <div className="para-small-medium">Search chats</div>
        </div>
      </div>
      {/* Chat section */}
      <div className="flex flex-col mt-4">
        <div className="text-neutral-400 mx-2 px-2">Chats</div>
        <div className="flex flex-col mt-2">
          {history.map((chat) => {
            return (
              <NavLink key={chat.id} to={ROUTES.CHAT_DETAIL(chat.id)}>
                <div className="rounded-lg para-small-medium cursor-pointer items-center mx-2 px-2 py-2 hover:bg-neutral-700 truncate">
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
