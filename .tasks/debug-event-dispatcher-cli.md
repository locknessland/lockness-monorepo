# Technical Task: CLI Debug Event Dispatcher

## 📋 Task Overview

Add a CLI command to inspect event dispatchers and their registered listeners,
similar to Symfony's `debug:event-dispatcher`. The command should help
developers see which events exist, which listeners are attached, and allow
filtering by event name or event class.

## 🎯 Objectives

1. **Expose Listener Introspection**: Provide a safe, public way to read
   dispatcher listener registrations without relying on private internals.
2. **Add CLI Debug Command**: Implement `debug:event-dispatcher` with filters
   and optional dispatcher selection.
3. **Match Symfony UX**: Support filtering by partial event names or class names
   and present a clear, grouped output.
4. **Keep Events Optional**: CLI should gracefully handle missing
   `@lockness/events` or empty listener registries.
5. **Document Usage**: Add user-facing docs and examples.

## 📁 Affected File Paths

### Core Files to Modify

- /packages/events/dispatcher.ts - Add a public introspection API for listeners.
- /packages/events/mod.ts - Export any new debug/introspection helpers.
- /packages/core/events/listener_discovery.ts - Register debug metadata when
  attaching listeners (class + method + event class + priority).

### Framework Files to Extend

- /packages/cli/commands/events_debug_command.ts - New CLI command
  implementation.
- /packages/cli/core_commands.ts - Register the new debug command.

### New Files to Create

- /packages/events/debug_registry.ts - Central registry that records listener
  metadata for debugging (event name, listener class, method, priority).

### Test Files

- /packages/events/tests/debug_registry.test.ts - Unit tests for registry API.
- /packages/cli/tests/debug_event_dispatcher.test.ts - CLI output and filtering
  tests.

### Documentation Files to Update

> ⚠️ Important: Follow the architecture and conventions documented in AGENTS.md

#### Core Documentation

- /packages/events/docs/DOCS.md - Add a "Debugging Events" section.
- /packages/cli/README.md - Document the new command and examples.

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: No centralized API for event listener introspection.
- **Solution**: Introduce a dedicated debug registry in `@lockness/events`.

**2. Open/Closed Principle (OCP)**

- **Current Problem**: CLI must not know about internal listener structures.
- **Solution**: Expose a stable debug API that can be extended without changing
  CLI code.

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: Debug tooling should work with any dispatcher instance.
- **Solution**: Make introspection methods part of `EventDispatcher`.

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: Dispatcher API lacks optional debug surface.
- **Solution**: Add minimal, focused debug methods to avoid polluting core API.

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: CLI could depend on events internals.
- **Solution**: CLI depends on the public debug API only.

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- No centralized debug registry, so each tool would need to re-derive listener
  lists.

**Solution:**

- Shared debug registry + dispatcher introspection helpers.

## 🎨 Proposed CLI API

### Command Usage

```bash
# List all events and listeners
./nessy debug:event-dispatcher

# Filter by event name or class name
./nessy debug:event-dispatcher kernel
./nessy debug:event-dispatcher kernel.exception
./nessy debug:event-dispatcher Security

# Specify a dispatcher (future-proof, optional)
./nessy debug:event-dispatcher --dispatcher=security.event_dispatcher.main
```

### Output Expectations

- Grouped by event name or class.
- Show listener class + method + priority.
- Include total listener count per event.
- When no matches: print a friendly empty state.

## 📝 Detailed Implementation Steps

### Phase 1: Events Debug Registry

1. Create `/packages/events/debug_registry.ts` to store and query listener
   metadata.
2. Add methods to `EventDispatcher` for returning a snapshot of registered
   listener entries (event name, priority, listener function).
3. Update `registerListeners()` and `discoverListeners()` in
   `/packages/core/events/listener_discovery.ts` to register debug metadata.

### Phase 2: CLI Command

1. Add `/packages/cli/commands/events_debug_command.ts` that:
   - Loads `@lockness/events` if available.
   - Resolves dispatcher selection (default: global dispatcher).
   - Applies optional filters (`args[0]`, `--dispatcher`).
   - Renders a grouped table (event name, listener, priority).
2. Register the command in `/packages/cli/core_commands.ts`.

### Phase 3: Documentation

1. Document the command in `/packages/cli/README.md`.
2. Add a "Debugging Events" section in `/packages/events/docs/DOCS.md` with
   examples and output format.

## 🧪 Testing Strategy

### Unit Tests

- [ ] Debug registry stores and retrieves listener metadata.
- [ ] Dispatcher introspection returns listener snapshots.

### CLI Tests

- [ ] Command renders all listeners without filters.
- [ ] Command filters by event name substring.
- [ ] Command handles missing events package gracefully.

## 🔍 Quality Checks

- deno lint packages/events/debug_registry.ts
  packages/cli/commands/events_debug_command.ts
- deno test packages/events/tests/debug_registry.test.ts
- deno test packages/cli/tests/debug_event_dispatcher.test.ts

## ✅ Definition of Done

- [ ] `debug:event-dispatcher` command is available via CLI.
- [ ] Listener metadata is accessible via public API.
- [ ] Filtering works by event name and event class.
- [ ] Docs updated with usage examples.
- [ ] Tests added and passing.

## 📅 Timeline

- **Start Date**: 2026-02-07
- **Estimated Completion**: 2026-02-12
- **Actual Completion**: [YYYY-MM-DD]
