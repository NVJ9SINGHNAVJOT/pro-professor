import { logger } from "@/logger/logger";

export const extractErrorDetails = (error: unknown) =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack || "unknown",
        cause: error.cause || "unknown",
      }
    : { error: "Unknown error type", details: String(error) };

export const logError = (message: string, error: unknown) => {
  logger.error(message, { error: extractErrorDetails(error) });
};
