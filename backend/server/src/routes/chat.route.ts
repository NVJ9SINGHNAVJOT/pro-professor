import { Router } from "express";
import { createChat, streamChat } from "@/controllers/chat.controller";

const chatRoute = Router();

chatRoute.post("/create", createChat);
chatRoute.post("/stream", streamChat);

export default chatRoute;
