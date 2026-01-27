# 🌐 Robust i18n Routing & System Paths Protection

## 📝 Context
The Lockness framework uses a dual-layer routing architecture where a "Mount Point" can be defined to prefix application routes (e.g., for i18n). 
The common pattern used is `/:langId/:countryId`.

**The Problem**: 
This pattern is too permissive. URLs like `/.well-known/appspecific/com.chrome.devtools.json` match this pattern (`langId=.well-known`, `countryId=appspecific`), triggering the i18n middleware. 
When the middleware validates these segments and finds they aren't valid ISO codes, it returns a `404 Not Found`, breaking system requests and polluting logs with error stacks in production.

## 🚀 Proposed Solutions

### Solution 1: Regex Path Constraints (Recommended)
Hono supports regex constraints directly in path parameters. We should change the pattern to only match 2-character lowercase strings.
- **Pattern**: `/:langId{[a-z]{2}}/:countryId{[a-z]{2}}`
- **Pros**: The middleware won't even be called for system paths. Zero overhead for non-matching URLs.
- **Cons**: Slightly more complex syntax for users.

### Solution 2: Explicit Exclusion List in MountPoint
Add an `exclude` property to the `MountPoint` configuration.
- **Interface**: 
  ```typescript
  interface MountPoint {
      pattern: string
      exclude?: string[] // e.g. ['.well-known', 'api', '_lockness']
      middleware?: MiddlewareHandler
  }
  ```
- **Pros**: Very clear and declarative.
- **Cons**: Requires users to maintain a list of exclusions.

### Solution 3: "Transparent" Middleware Refactoring
Instead of returning `c.notFound()` when parameters are invalid, the middleware calls `next()`.
- **Logic**:
  ```typescript
  if (!isValid(langId)) return await next();
  ```
- **Pros**: No configuration needed.
- **Cons**: The request continues down the "mounted" route stack instead of the "root" route stack, which might lead to unexpected behavior or double-matching issues.

## 🛠 Action Plan

1. **Update `MountPoint` type**: Add `exclude?: string[]` and documentation about regex patterns.
2. **Refactor `MountManager`**: Implement exclusion logic before applying the mount-specific middleware.
3. **Update Documentation**: Explain how to protect system routes when using multi-mount routing.
4. **Improve Default Pattern**: Suggest the regex-constrained pattern in stubs and examples.

---
**Status**: 🗓️ Pending
**Priority**: 🟠 Medium
**Owner**: @lockness/core
