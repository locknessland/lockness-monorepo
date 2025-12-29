import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './app/model/*.ts',
    out: './database/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: Deno.env.get('DATABASE_URL') ||
            'postgres://localhost:5432/lockness',
    },
})
