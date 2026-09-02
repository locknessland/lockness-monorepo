/**
 * @fileoverview Dev-server bridge Vite plugin — forwards non-asset requests to
 * the Lockness `App.fetch()` handler (injected, never imported) and injects
 * collected CSS into HTML responses. Owns the single Vite-internal/asset-request
 * predicate.
 *
 * Skeleton only (#105) — implemented in #108.
 *
 * @module @lockness/vite/plugins/dev_server
 */

// TODO(#108): configureServer bridge; allowlist asset predicate (default-forward
// to App.fetch); verbatim request/response forwarding; loopback bind default +
// server.fs.strict.
export {}
