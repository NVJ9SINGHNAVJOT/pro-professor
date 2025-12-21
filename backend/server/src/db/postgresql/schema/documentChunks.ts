import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { knowledgeSources } from "@/db/postgresql/schema/knowledgeSources";

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  knowledgeSourceId: integer("knowledge_source_id")
    .notNull()
    .references(() => knowledgeSources.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  qdrantId: varchar("qdrant_id", { length: 255 }).notNull(),
  tokenCount: integer("token_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
