import { ERROR_TYPES, type ErrorType } from "@/constants/errorTypes";
import { extractErrorDetails } from "@/logger/error";
import { logger } from "@/logger/logger";
import { Request, Response } from "express";
import { AppError } from "@/types/error";
import { getRequestId } from "@/utils/request";

function getErrorResponsePayload(error?: unknown) {
  if (!error) return null;

  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      type: error.type,
      details: error.details ?? null,
    };
  }

  if (!(error instanceof Error) && typeof error === "object") {
    return error;
  }

  return extractErrorDetails(error);
}

export function errRes(req: Request, res: Response, status: number, message: string, error?: unknown): Response {
  const requestId = getRequestId(req);
  const errorPayload = getErrorResponsePayload(error);

  logger.error(message, {
    requestId,
    status,
    error: errorPayload,
  });

  res.setHeader("x-request-id", requestId);

  return res.status(status).json({
    message,
    error: errorPayload,
  });
}

export function internalErrRes(req: Request, res: Response, error: unknown): Response {
  return errRes(req, res, ERROR_TYPES.INTERNAL_SERVER_ERROR.statusCode, ERROR_TYPES.INTERNAL_SERVER_ERROR.type, error);
}

export function controllerError(req: Request, res: Response, error: unknown): Response {
  if (error instanceof AppError) {
    return errRes(req, res, error.statusCode, error.message, error);
  }

  return internalErrRes(req, res, error);
}

export function createAppError(type: ErrorType, message: string, details?: unknown): AppError {
  return new AppError(ERROR_TYPES[type], message, details);
}
