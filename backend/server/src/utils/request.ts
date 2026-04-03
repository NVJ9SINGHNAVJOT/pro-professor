import { Request } from "express";
import { CustomRequest } from "@/types/custom";

export function getRequestId(req: Request): string {
  return (req as CustomRequest).requestId || "Unknown";
}
