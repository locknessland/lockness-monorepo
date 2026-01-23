# 🛠 Framework Core

- [ ] **Preserve Comments in `deno.jsonc`**
  - [ ] **Issue**: The current `scripts/bump.ts` uses `JSON.stringify`, which
        strips all comments from `deno.jsonc` when updating versions.
  - [ ] **Goal**: Implement a mechanism to update versions in `deno.jsonc` while
        preserving structure and comments.
  - [ ] **Possible Solutions**:
    - Use a dedicated CST/AST parser for JSONC (e.g., `jsonc-parser` or
      `deno_jsonc` if available with edit support).
    - Use a regex-based replacement strategy for specific keys (`version`,
      `imports`) to avoid full re-serialization.
