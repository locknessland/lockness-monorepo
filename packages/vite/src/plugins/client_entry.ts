/**
 * @fileoverview `lockness:client-entry` virtual-module Vite plugin — resolves
 * the stable client entrypoint Vite bundles, re-exporting the (stubbed) Lockness
 * client runtime and the user's `app/client.ts` when present.
 *
 * Skeleton only (#105) — implemented in #109.
 *
 * @module @lockness/vite/plugins/client_entry
 */

// TODO(#109): resolveId lockness:client-entry -> \0lockness:client-entry; load
// generates the module (client runtime stub + optional app/client.ts + dev HMR).
export {}
