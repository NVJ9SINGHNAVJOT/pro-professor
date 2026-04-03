import { boolean, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // llama3.1 or provider model id
  provider: varchar("provider", { length: 50 }).notNull(), // ollama | ai-service
  role: varchar("role", { length: 50 }).notNull(), // chat | embedding
  version: varchar("version", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
}, (table) => ({
  providerNameUniqueIdx: uniqueIndex("models_provider_name_unique_idx").on(table.provider, table.name),
}));
