import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tags } from "@/db/postgresql/schema/tags";
import { knowledgeSources } from "@/db/postgresql/schema/knowledgeSources";

export const knowledgeSourceTags = pgTable("knowledge_source_tags", {
  id: serial("id").primaryKey(),
  knowledgeSourceId: integer("knowledge_source_id")
    .notNull()
    .references(() => knowledgeSources.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
