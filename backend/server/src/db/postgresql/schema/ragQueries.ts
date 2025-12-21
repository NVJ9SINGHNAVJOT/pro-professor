import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { conversations } from "@/db/postgresql/schema/conversations";

export const ragQueries = pgTable("rag_queries", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
