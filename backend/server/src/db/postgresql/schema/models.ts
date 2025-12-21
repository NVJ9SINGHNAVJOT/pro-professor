import { pgTable, serial, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // llama3.1
  provider: varchar("provider", { length: 50 }).notNull(), // ollama
  role: varchar("role", { length: 50 }).notNull(), // chat | embedding
  version: varchar("version", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});
