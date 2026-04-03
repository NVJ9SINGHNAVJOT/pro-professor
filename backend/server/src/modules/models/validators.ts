import { z } from "zod";

export const getAllModelsQuerySchema = z.object({});

export type GetAllModelsQuery = z.infer<typeof getAllModelsQuerySchema>;
