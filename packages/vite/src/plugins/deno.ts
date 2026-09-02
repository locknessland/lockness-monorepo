/**
 * @fileoverview Deno specifier resolver Vite plugin — resolves `jsr:`, `npm:`
 * and `https:` specifiers through Deno so Lockness app code resolves under Vite
 * dev and build. Imports nothing Lockness-specific so it stays reusable.
 *
 * Skeleton only (#105) — implemented in #106 (validated against Rolldown first).
 *
 * @module @lockness/vite/plugins/deno
 */

// TODO(#106): denoResolver() — intercept jsr:/npm:/https:, pass local imports
// through; invoke Deno via Deno.Command (arg-array, no shell) with a validated
// specifier allowlist; delegate https: to Deno with no custom fetch.
export {}
