import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { models } from "@/db/postgresql/schema/models";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id")
    .notNull()
    .references(() => models.id),
  mode: varchar("mode", { length: 50 }).notNull(), // simple | rag
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
