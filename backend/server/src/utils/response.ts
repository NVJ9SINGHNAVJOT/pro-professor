import { Request, Response } from "express";
import { logger } from "@/logger/logger";
import { getRequestId } from "@/utils/request";

export function successRes<T>(
  req: Request,
  res: Response,
  status: number,
  message: string,
  data?: T
): Response {
  const requestId = getRequestId(req);

  logger.info(message, {
    requestId,
    status,
    data,
  });

  res.setHeader("x-request-id", requestId);

  return res.status(status).json({
    message,
    data: data ?? null,
  });
}
