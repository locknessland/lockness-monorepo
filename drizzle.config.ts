import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './src/model/*.ts',
    out: './migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: Deno.env.get('DATABASE_URL') ||
            'postgres://localhost:5432/lockness',
    },
})
