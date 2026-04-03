import { extractErrorDetails } from "@/logger/error";
import { logger } from "@/logger/logger";
import { Request, Response } from "express";
import { getRequestId } from "@/utils/request";

export function errRes(req: Request, res: Response, status: number, message: string, error?: unknown): Response {
  const requestId = getRequestId(req);
  const errorDetails = error ? extractErrorDetails(error) : null;

  logger.error(message, {
    requestId,
    status,
    error: errorDetails,
  });

  res.setHeader("x-request-id", requestId);

  return res.status(status).json({
    message,
    error: errorDetails,
  });
}

export function internalErrRes(req: Request, res: Response, error: unknown): Response {
  return errRes(req, res, 500, "Internal server error", error);
}
