import { extractErrorDetails } from "@/logger/error";
import { logger } from "@/logger/logger";
import { CustomRequest } from "@/types/custom";
import { Request, Response } from "express";
import { object } from "zod/v4";

function getRequestId(req: Request): string {
  return (req as CustomRequest).requestId || "Unknown";
}

export function errRes(req: Request, res: Response, status: number, message: string, error?: unknown): Response {
  logger.error(message, {
    requestId: getRequestId(req),
    status,
    error: error ? (error === typeof object ? error : extractErrorDetails(error)) : undefined,
  });

  return res.status(status).json({ message });
}

export function internalErrRes(req: Request, res: Response, error: unknown): Response {
  const requestId = getRequestId(req);

  logger.error("Internal server error", {
    requestId,
    status: 500,
    error: extractErrorDetails(error),
  });

  return res.status(500).json({ message: "Internal server error" });
}
