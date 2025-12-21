import { pgTable, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { ragQueries } from "@/db/postgresql/schema/ragQueries";
import { documentChunks } from "@/db/postgresql/schema/documentChunks";

export const ragQueryChunks = pgTable("rag_query_chunks", {
  id: serial("id").primaryKey(),
  ragQueryId: integer("rag_query_id")
    .notNull()
    .references(() => ragQueries.id, { onDelete: "cascade" }),
  documentChunkId: integer("document_chunk_id")
    .notNull()
    .references(() => documentChunks.id, { onDelete: "cascade" }),
  similarityScore: real("similarity_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
