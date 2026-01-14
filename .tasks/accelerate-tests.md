# Technical Task: Speed Up Unit Tests

## 📋 Task Overview

Our current Deno test suite takes ~87 seconds to execute 3515 tests across
packages. The biggest offenders are a handful of tests that use real time delays
or touch the filesystem. We need to replace time-based waits with deterministic
time mocks, eliminate real filesystem I/O from unit tests, and reduce
unnecessary delays so the test suite runs faster and more predictably in CI.

## 🎯 Objectives

1. **Primary Objective**: Reduce total runtime of
   `deno test packages/ --allow-all` by removing blocking delays and slow I/O
   patterns.
2. **Secondary Objective**: Replace real `setTimeout` calls in unit tests with
   deterministic time control (FakeTime or similar) without losing coverage.
3. **Additional Objective**: Introduce in-memory storage mocks so storage unit
   tests stop writing to `./tmp` folders.
4. **Quality Objective**: Ensure the revised tests stay hermetic (no external
   side effects) and continue to assert the same behaviors.
5. **Documentation Objective**: Document the new testing patterns (time mocking,
   storage mocks) in GEMINI.md and LLM notes so future contributors follow the
   faster approach.

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/session/tests/drivers.test.ts` - Swap `setTimeout` waits for
  FakeTime ticks.
- `/packages/cache/tests/features.test.ts` - Replace `setTimeout` delays used
  for TTL tests.
- `/packages/events/tests/events.test.ts` - Reduce micro-delays and evaluate
  need for FakeTime.
- `/packages/storage/tests/local.test.ts` - Switch to in-memory mock driver
  rather than writing to disk.
- `/packages/storage/tests/manager.test.ts` - Same as above for storage manager.

### Framework Files to Extend

- `/packages/storage/mod.ts` - Export storage mock utilities if needed.
- `/packages/testing/mod.ts` (new helper module, optional) - Provide shared
  FakeTime and storage mock helpers.

### New Files to Create

- `/packages/storage/tests/support/mock_driver.ts` - Memory-based storage driver
  for tests.
- `/packages/testing/time.ts` - Helper wrapping FakeTime usage for consistency.

### Test Files

- `/packages/storage/tests/storage_fast.test.ts` (optional) - Split fast-path
  tests if refactoring makes sense.
- `/packages/events/tests/events_fast.test.ts` (optional) - If we isolate
  FakeTime-based assertions.

### Documentation Files to Update

#### Core Documentation

- `/GEMINI.md` - Document testing guidelines for FakeTime and storage mocks.
- `/README.md` - Mention faster test strategy in contributor section.
- `/packages/storage/README.md` - Reference mock driver for testing guidance.

#### LLM Documentation

- `/public/llms/testing.txt` - Add new recommendations for performant tests.
- `/public/llms/full.txt` - Update with testing best practices.

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Tests are responsible for both behavioral verification
  and time/file orchestration, making them slow.
- **Solution**: Extract time and storage helpers into dedicated modules so tests
  only focus on behavior.

**2. Open/Closed Principle (OCP)**

- **Solution**: Provide reusable helpers (`FakeTimeUtil`, `MockStorageDriver`)
  that can be extended for future test scenarios without modifying existing
  tests.

**3. Liskov Substitution Principle (LSP)**

- **Solution**: Ensure the storage mock conforms to the StorageDriver interface
  so it is a drop-in replacement without altering test semantics.

**4. Interface Segregation Principle (ISP)**

- **Solution**: Keep helpers focused—separate time utilities from storage mocks
  to avoid bloated helper modules.

**5. Dependency Inversion Principle (DIP)**

- **Solution**: Tests depend on abstractions (interfaces) instead of concrete
  filesystem or real time, allowing injection of fast mocks.

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Multiple tests implement ad-hoc `setTimeout` waits.
- Storage tests each create their own temp paths under `./tmp`.

**Solution:**

- Centralize time manipulation with a single FakeTime helper.
- Provide shared mock storage utilities rather than per-test setups.

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  Test Layer                              │  ← Uses helpers to assert behavior
├─────────────────────────────────────────┤
│  Testing Utilities Layer                 │  ← FakeTime, storage mocks
├─────────────────────────────────────────┤
│  Core Implementation Layer               │  ← Storage/session/cache modules
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Keep tests deterministic (no randomness, no real time delays).
- No writes to the repo root (`./tmp`) during unit tests.
- Helpers must be reusable across packages.

## 🎨 Proposed API Design

### Target Test Helper for Time

```typescript
import { FakeTime } from '@std/testing/time'

Deno.test('session expiration fast path', () => {
    using time = new FakeTime()

    await driver.write('expire', { id: 1 }, 1)

    time.tick(1100) // simulate

    assertEquals(await driver.read('expire'), null)
})
```

### Target Test Helper for Storage

```typescript
import { createMockStorage } from '../tests/support/mock_driver.ts'

const driver = createMockStorage()
await driver.put('file.txt', 'hello')
assertEquals(await driver.get('file.txt'), 'hello')
```

## 📝 Detailed Implementation Steps

### Phase 1: Time Mocking Infrastructure

**Step 1.1: Introduce FakeTime helper**

File: `/packages/testing/time.ts`

```typescript
import { FakeTime } from '@std/testing/time'

export class TimeController {
    constructor(private resolution = 1) {}

    use() {
        return new FakeTime(undefined, this.resolution)
    }

    advance(ms: number) {
        return FakeTime.tick(ms)
    }
}
```

**Step 1.2: Apply to session tests**

File: `/packages/session/tests/drivers.test.ts`

```typescript
Deno.test('MemorySessionDriver - session expiration (fast)', () => {
    using time = new FakeTime()

    await driver.write('expire', { id: 789 }, 1)
    time.tick(1100)

    assertEquals(await driver.read('expire'), null)
})
```

**Step 1.3: Apply to cache TTL tests**

File: `/packages/cache/tests/features.test.ts`

```typescript
await set('expiring', 'value', 0.1)
using time = new FakeTime()

time.tick(150)
assertEquals(await get('expiring'), null)
```

### Phase 2: Storage Mocking

**Step 2.1: Create mock storage driver**

File: `/packages/storage/tests/support/mock_driver.ts`

```typescript
class MemoryStorageDriver implements StorageDriver {
    private store = new Map<string, Uint8Array>()

    async put(path: string, content: string | Uint8Array) {
        const bytes = typeof content === 'string'
            ? new TextEncoder().encode(content)
            : content
        this.store.set(path, bytes)
    }

    async get(path: string) {
        const bytes = this.store.get(path)
        return bytes ? new TextDecoder().decode(bytes) : null
    }

    // other methods same way...
}
```

**Step 2.2: Refactor local and manager tests**

File: `/packages/storage/tests/local.test.ts`

```typescript
const driver = createMockStorage({ driver: 'local' })
```

**Step 2.3: Cleanup shared tmp directories**

- Remove reliance on `./tmp/test-*` paths.
- Delete existing `tmp/test-*` directories in repo (if present).

### Phase 3: Fine-Tune Event Tests

**Step 3.1: Shorten micro delays**

File: `/packages/events/tests/events.test.ts`

```typescript
await new Promise((resolve) => setTimeout(resolve, 1))
```

**Step 3.2: Evaluate FakeTime**

- Use FakeTime where asynchronous event loops require deterministic control.

### Phase 4: Documentation & Examples

**Step 4.1: GEMINI.md updates**

- Add "Testing Best Practices" section covering FakeTime and storage mock usage.

**Step 4.2: LLM docs**

- Update `/public/llms/testing.txt` and `/public/llms/full.txt` to reflect
  faster testing approach.

## 🔄 Migration Guide

### For Contributors

**Before:**

- Tests using `await new Promise((resolve) => setTimeout(resolve, N))` with
  real-world delays.
- Storage tests writing to `./tmp` directories.

**After:**

- Use FakeTime helpers to advance time instantly.
- Use in-memory storage mocks so tests run without touching disk.

### Breaking Changes

- ⚠️ None. Only test code changes.

### Deprecation Strategy

1. Update tests to use new helpers.
2. Document in contribution guidelines.
3. Remove old patterns from examples.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/GEMINI.md` testing section.
- [ ] Update `/README.md` contributor guide.
- [ ] Update `/packages/storage/README.md` testing notes.

### LLM Documentation

- [ ] Update `/public/llms/testing.txt`.
- [ ] Update `/public/llms/full.txt`.

### README Files

- [ ] Ensure examples mention faster testing patterns.

## 🧪 Testing Strategy

### Unit Tests

- [ ] Ensure new helpers have basic coverage (e.g., storage mock functionality).
- [ ] Validate session/cache tests still pass and run faster.

### Integration Tests

- [ ] Run `deno test packages/ --allow-all` before/after to measure the
      improvement.

### Manual Testing

- [ ] Verify no files appear under `./tmp` after tests.
- [ ] Ensure FakeTime cleanup (`using` block) is respected so tests do not leak
      timers.

## ✅ Definition of Done

- [ ] Tests use deterministic time mocks instead of `setTimeout` delays.
- [ ] Storage unit tests run entirely in memory.
- [ ] No residual files in repo after `deno test`.
- [ ] Runtime improvement documented (e.g., before vs after timing in PR
      description).
- [ ] Documentation updated with new testing guidelines.
- [ ] LLM docs refreshed.

## 🔗 Related Tasks

- [upgrade-package.md](upgrade-package.md) – previous performance tooling
  improvements (context for project health).

## 📅 Timeline

- **Start Date**: 2026-01-14
- **Estimated Completion**: 2026-01-21
- **Actual Completion**: TBD

## 📝 Notes

- Switching to FakeTime offers the largest gain (removes ~2.2s from session
  tests alone).
- Storage mocks eliminate flakiness and filesystem pollution (`tmp/` folders).
- Consider running tests with `--jobs` once deterministic (future enhancement).
- Keep eye on other packages (queue, validator) for hidden delays, but initial
  focus is the identified hotspots.

---

_Task created: 2026-01-14_ _Last updated: 2026-01-14_
