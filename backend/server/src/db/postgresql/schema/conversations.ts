import { integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { models } from "@/db/postgresql/schema/models";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id")
    .notNull()
    .references(() => models.id),
  title: varchar("title", { length: 255 }),
  mode: varchar("mode", { length: 50 }).notNull(), // simple | rag
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
