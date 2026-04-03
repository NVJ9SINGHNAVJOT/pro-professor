import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { errRes } from "@/utils/error";

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return errRes(req, res, 400, "Invalid request body.", parsed.error.flatten());
    }

    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      return errRes(req, res, 400, "Invalid query params.", parsed.error.flatten());
    }

    req.query = parsed.data;
    next();
  };
}

export function validateParams(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const parsed = schema.safeParse(req.params);

    if (!parsed.success) {
      return errRes(req, res, 400, "Invalid route params.", parsed.error.flatten());
    }

    req.params = parsed.data;
    next();
  };
}
