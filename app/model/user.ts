import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { z } from '@lockness/validator'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password'),
    name: text('name'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

// Zod schemas for validation
export const insertUserSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().optional(),
})

// TypeScript types inferred from Drizzle
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
