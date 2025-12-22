/** @type { import("drizzle-kit").Config } */
export default {
  schema: './src/model/*.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
  },
}
