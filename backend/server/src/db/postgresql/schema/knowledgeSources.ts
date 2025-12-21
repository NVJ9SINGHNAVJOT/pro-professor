import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const knowledgeSources = pgTable("knowledge_sources", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(), // pdf, book, web
  description: text("description"),
  storagePath: text("storage_path").notNull(), // S3 / MinIO path
  status: varchar("status", { length: 50 }).notNull().default("uploaded"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
