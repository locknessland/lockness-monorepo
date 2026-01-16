# Technical Task: Migrate Devtools Package from Hono JSX to React

## 📋 Task Overview

The `@lockness/devtools` package currently uses Hono's JSX runtime for
server-side rendering. This task involves migrating the entire package to use
React instead, providing access to a richer ecosystem, better tooling support,
and more familiar syntax for developers.

The migration will maintain all existing functionality while updating the JSX
syntax, event handlers, and rendering logic to be React-compliant. This is a
non-breaking change from the user's perspective - the devtools dashboard and
toolbar will continue to work identically.

## 🎯 Objectives

1. **Primary Objective**: Successfully migrate all JSX components from Hono JSX
   to React
2. **Configuration Objective**: Update build configuration to use React's JSX
   transform
3. **API Compatibility Objective**: Maintain existing public API - no breaking
   changes for users
4. **Testing Objective**: Ensure all functionality works identically after
   migration
5. **Documentation Objective**: Document the change and update relevant files

## 📁 Affected File Paths

### Core Configuration Files

- `/packages/devtools/deno.json` - Update JSX compiler options and add React
  imports
- `/packages/devtools/dashboard.tsx` - Replace Hono rendering with
  ReactDOMServer
- `/packages/devtools/components/toolbar.tsx` - Update JSX event handlers

### UI Components to Update

- `/packages/devtools/ui/Dashboard.tsx` - Update event handlers (onclick →
  onClick)
- `/packages/devtools/ui/Layout.tsx` - Update JSX syntax
- `/packages/devtools/ui/atoms/Button.tsx` - Convert to React-compatible syntax
- `/packages/devtools/ui/atoms/Table.tsx` - Update event handlers
- `/packages/devtools/ui/atoms/Text.tsx` - Ensure React compatibility
- `/packages/devtools/ui/components/BackToAppButton.tsx` - Update onclick events
- `/packages/devtools/ui/components/Badge.tsx` - Verify React compatibility
- `/packages/devtools/ui/components/Card.tsx` - Update JSX syntax
- `/packages/devtools/ui/components/ClearDataButton.tsx` - Update onclick events
- `/packages/devtools/ui/components/CopyButton.tsx` - **Critical**: Convert
  inline script strings to React event handlers
- `/packages/devtools/ui/components/MetadataCard.tsx` - Update event handlers
- `/packages/devtools/ui/components/Navbar.tsx` - Update JSX syntax
- `/packages/devtools/ui/components/NavTabs.tsx` - Update onclick events
- `/packages/devtools/ui/components/Separator.tsx` - Verify React compatibility
- `/packages/devtools/ui/components/Tab.tsx` - Update onclick events
- `/packages/devtools/ui/panels/Deprecations.tsx` - Update event handlers
- `/packages/devtools/ui/panels/Overview.tsx` - Update JSX syntax
- `/packages/devtools/ui/panels/PlaceholderPanel.tsx` - Verify React
  compatibility
- `/packages/devtools/ui/panels/Requests.tsx` - Update event handlers
- `/packages/devtools/ui/panels/Routes.tsx` - Update JSX syntax

### Toolbar Components

- `/packages/devtools/components/toolbar.tsx` - Main toolbar component (update
  JSX)
- `/packages/devtools/components/icons.ts` - SVG components (update attributes)
- `/packages/devtools/components/logo-button.tsx` - Update onclick events
- `/packages/devtools/components/metrics.tsx` - Update JSX syntax
- `/packages/devtools/components/request-info.tsx` - Update event handlers
- `/packages/devtools/components/status-badge.tsx` - Verify React compatibility
- `/packages/devtools/components/toolbar-item.tsx` - Update onclick events

### Test Files

- `/packages/devtools/tests/toolbar.test.ts` - Verify toolbar still renders
  correctly
- `/packages/devtools/tests/collector.test.ts` - Ensure no regressions
- `/packages/devtools/tests/helpers.test.ts` - Update if testing JSX rendering

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/devtools/README.md` - Document React migration (optional note)
- `/packages/devtools/REFACTORING_SUMMARY.md` - Add note about React migration

#### User Documentation (Web)

- No user-facing documentation updates needed (internal implementation detail)

## 🏗️ Architecture Principles

### Single Responsibility Principle (SRP)

**Current State**: Components already follow SRP with focused responsibilities

**Solution**: Maintain existing component structure - no architectural changes
needed

### Open/Closed Principle (OCP)

**Current State**: Components are properly encapsulated

**Solution**: Keep public APIs unchanged, only update internal JSX syntax

### Dependency Inversion Principle (DIP)

**Current Problem**: Direct dependency on Hono's JSX runtime

**Solution**: Swap dependency to React, but maintain same component interfaces

```typescript
// Before (Hono JSX)
import type { FC } from 'hono/jsx'

// After (React)
import type { FC } from 'react'
```

### DRY Principle (Don't Repeat Yourself)

**Current State**: Good - shared theme system, reusable atomic components

**Solution**: Maintain DRY - no duplication introduced during migration

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  Lockness Application Layer             │  ← Uses devtools middleware (unchanged)
├─────────────────────────────────────────┤
│  Devtools Middleware Layer              │  ← Public API (unchanged)
├─────────────────────────────────────────┤
│  Component Rendering Layer              │  ← Hono JSX → React (internal change)
├─────────────────────────────────────────┤
│  Data Collection Layer                  │  ← Unchanged
└─────────────────────────────────────────┘
```

**Key Constraints:**

- No breaking changes to public API
- Maintain existing performance characteristics
- Server-side rendering only (no client-side React needed)
- Keep inline styles approach (no CSS-in-JS libraries)

## 🎨 Current vs Target API

### User-Facing API (Unchanged)

```typescript
// Users don't see any difference
import { devtools } from '@lockness/devtools'

const app = new App()
app.useMiddleware(devtools())
```

### Internal Component API (Changed)

**Before (Hono JSX):**

```tsx
// Hono JSX syntax with lowercase event handlers
export const Button = ({ label, onClick }: Props) => {
    return (
        <button
            onclick={onClick}
            onmouseover="this.style.backgroundColor = '#ccc'"
        >
            {label}
        </button>
    )
}
```

**After (React):**

```tsx
// React syntax with camelCase event handlers
export const Button = ({ label, onClick }: Props) => {
    const handleMouseOver = (e: React.MouseEvent) => {
        e.currentTarget.style.backgroundColor = '#ccc'
    }

    return (
        <button
            onClick={onClick}
            onMouseOver={handleMouseOver}
        >
            {label}
        </button>
    )
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Configuration Setup

**Step 1.1: Update deno.json Configuration**

File: `/packages/devtools/deno.json`

```json
{
    "name": "@lockness/devtools",
    "version": "0.1.23",
    "compilerOptions": {
        "jsx": "react-jsx",
        "jsxImportSource": "react"
    },
    "imports": {
        "hono": "jsr:@lockness/hono@^0.1.22",
        "react": "npm:react@^18.3.1",
        "react-dom": "npm:react-dom@^18.3.1",
        "@types/react": "npm:@types/react@^18.3.12",
        "@types/react-dom": "npm:@types/react-dom@^18.3.1"
    }
}
```

**Changes:**

- Update `jsx` from `"precompile"` to `"react-jsx"`
- Change `jsxImportSource` from `"hono"` to `"react"`
- Add React and ReactDOM dependencies
- Add React type definitions

**Step 1.2: Update dashboard.tsx Rendering**

File: `/packages/devtools/dashboard.tsx`

```typescript
import { renderToString } from 'react-dom/server'
import type { Context } from 'hono'
import { Dashboard } from './ui/Dashboard.tsx'

export function renderDashboard(c: Context) {
    const requests = /* ... get requests ... */
    const routes = /* ... get routes ... */
    const deprecations = /* ... get deprecations ... */
    
    // Replace Hono rendering with React
    const html = renderToString(
        <Dashboard 
            requests={requests}
            routes={routes}
            deprecations={deprecations}
        />
    )
    
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lockness Devtools</title>
</head>
<body>
    <div id="root">${html}</div>
</body>
</html>`)
}
```

### Phase 2: Convert Event Handlers (Critical Changes)

**Step 2.1: Update CopyButton Component (Most Complex)**

File: `/packages/devtools/ui/components/CopyButton.tsx`

**Before (Hono JSX with inline scripts):**

```tsx
const copyToClipboard =
    `navigator.clipboard.writeText('${value}').then(() => { ... })`

return (
    <button
        onclick={copyToClipboard}
        onmouseover={hoverScript}
        onmouseout={unhoverScript}
    >
        <svg id={`copy-${label.replace(/\s+/g, '-')}`}>...</svg>
    </button>
)
```

**After (React with proper event handlers):**

```tsx
import { useState } from 'react'
import { borderRadius, colors } from '../theme.ts'

export const CopyButton = (
    { value, label }: { value: string; label: string },
) => {
    const [isHovered, setIsHovered] = useState(false)
    const [isCopied, setIsCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setIsCopied(true)
            setTimeout(() => setIsCopied(false), 1000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const buttonStyles = {
        padding: '6px',
        backgroundColor: isHovered ? colors.bg.hover : 'transparent',
        border: 'none',
        borderRadius: borderRadius.md,
        transition: 'background-color 200ms',
        cursor: 'pointer',
    }

    const iconStyles = {
        width: '16px',
        height: '16px',
        color: isCopied
            ? '#10b981'
            : (isHovered ? colors.text.primary : colors.text.muted),
        transition: 'color 200ms',
    }

    return (
        <button
            type='button'
            onClick={handleCopy}
            onMouseOver={() => setIsHovered(true)}
            onMouseOut={() => setIsHovered(false)}
            style={buttonStyles}
            title='Copy to clipboard'
        >
            <svg
                style={iconStyles}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
            >
                <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                />
            </svg>
        </button>
    )
}
```

**Key Changes:**

- ✅ Added React hooks (`useState`) for hover and copy state
- ✅ Converted inline script strings to proper async functions
- ✅ Changed `onclick` → `onClick`, `onmouseover` → `onMouseOver`, `onmouseout`
  → `onMouseOut`
- ✅ Changed SVG attributes: `stroke-linecap` → `strokeLinecap`, `stroke-width`
  → `strokeWidth`
- ✅ Removed `id` on SVG (no longer needed with state management)
- ✅ Made hover/copy states reactive

**Step 2.2: Update All Other Components**

Create a search-and-replace script for common patterns:

```bash
# Find all .tsx files
find packages/devtools -name "*.tsx" -type f

# Common replacements needed:
# onclick → onClick
# onmouseover → onMouseOver
# onmouseout → onMouseOut
# onchange → onChange
# onfocus → onFocus
# onblur → onBlur
# stroke-linecap → strokeLinecap
# stroke-linejoin → strokeLinejoin
# stroke-width → strokeWidth
# fill-rule → fillRule
# clip-rule → clipRule
```

**Step 2.3: Update SVG Components**

File: `/packages/devtools/components/icons.ts`

```typescript
// Before (Hono JSX)
export const CheckIcon = () => (
    <svg stroke-width='2'>
        <path stroke-linecap='round' />
    </svg>
)

// After (React)
export const CheckIcon = () => (
    <svg strokeWidth='2'>
        <path strokeLinecap='round' />
    </svg>
)
```

### Phase 3: Update Component Imports and Types

**Step 3.1: Update Type Imports**

Search and replace across all component files:

```typescript
// Before
import type { FC } from 'hono/jsx'
import type { PropsWithChildren } from 'hono/jsx'

// After
import type { FC, PropsWithChildren } from 'react'
```

**Step 3.2: Remove Unnecessary Hono Imports**

Components should no longer import from `hono/jsx`:

```typescript
// Remove these imports
import { jsx } from 'hono/jsx'
import { html } from 'hono/jsx'

// React JSX transform handles this automatically
```

### Phase 4: Testing and Validation

**Step 4.1: Manual Testing Checklist**

```bash
# Start dev server
deno task dev

# Navigate to devtools dashboard
open http://localhost:8000/_devtools

# Test all interactive features:
# ✅ Copy buttons work
# ✅ Tab navigation works
# ✅ Request list is clickable
# ✅ Hover states work correctly
# ✅ Clear data button works
# ✅ Back to app button works
```

**Step 4.2: Unit Tests**

File: `/packages/devtools/tests/react-migration.test.ts`

```typescript
import { assertEquals, assertStringIncludes } from '@std/assert'
import { renderToString } from 'react-dom/server'
import { CopyButton } from '../ui/components/CopyButton.tsx'

Deno.test('CopyButton - renders with React', () => {
    const html = renderToString(
        <CopyButton value='test-value' label='Test' />,
    )

    assertStringIncludes(html, 'Copy to clipboard')
    assertStringIncludes(html, 'button')
})

Deno.test('Dashboard - renders without errors', () => {
    const html = renderToString(
        <Dashboard requests={[]} routes={[]} deprecations={[]} />,
    )

    assertStringIncludes(html, 'Lockness Devtools')
})
```

**Step 4.3: Run Existing Tests**

```bash
# Ensure no regressions
deno test packages/devtools/tests/

# All tests should pass:
# ✅ collector.test.ts
# ✅ helpers.test.ts
# ✅ toolbar.test.ts
```

## 🔄 Migration Guide

### For Devtools Users (No Changes Required)

The migration is completely transparent to users. No code changes needed:

```typescript
// Before migration - works exactly the same
import { devtools } from '@lockness/devtools'

const app = new App()
app.useMiddleware(devtools())

// After migration - identical usage
import { devtools } from '@lockness/devtools'

const app = new App()
app.useMiddleware(devtools())
```

### For Devtools Contributors

**Before (Contributing to Hono JSX version):**

```tsx
// Use lowercase event handlers
<button onclick={handler}>Click</button>

// Use hyphenated SVG attributes
<path stroke-width="2" />
```

**After (Contributing to React version):**

```tsx
// Use camelCase event handlers
<button onClick={handler}>Click</button>

// Use camelCase SVG attributes
<path strokeWidth="2" />
```

### Breaking Changes

- ⚠️ **None for users** - This is an internal implementation change
- ⚠️ **For contributors**: JSX syntax changes (see above)

### Deprecation Strategy

Not applicable - this is an internal refactor with no user-facing deprecations.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/packages/devtools/README.md` with optional note about React
- [ ] Update `/packages/devtools/REFACTORING_SUMMARY.md` with migration details
- [ ] Add JSDoc comments to updated components (if not already present)

### User Documentation (Web Docs)

- [ ] No updates needed - internal implementation detail

### LLM Documentation

- [ ] No updates needed - public API unchanged

### Stub Templates

- [ ] No stub updates needed - devtools has no stub templates

### README Files

- [ ] Update `/packages/devtools/README.md` with technical details section
- [ ] Add note about React being used internally (for transparency)

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test CopyButton renders correctly with React
- [ ] Test all panels render without errors
- [ ] Test Dashboard renders with empty data
- [ ] Test Dashboard renders with full data
- [ ] Mock React state hooks in tests if needed

### Integration Tests

- [ ] Test devtools middleware with React-rendered dashboard
- [ ] Test toolbar renders in Hono app
- [ ] Test all interactive features work end-to-end

### Manual Testing

- [ ] Test in development mode (`deno task dev`)
- [ ] Navigate to `/_devtools` dashboard
- [ ] Click all tabs (Overview, Requests, Routes, Deprecations)
- [ ] Test copy buttons in metadata panel
- [ ] Test request list interaction
- [ ] Test clear data button
- [ ] Verify toolbar appears in bottom-right corner
- [ ] Check browser console for errors

### Performance Testing

- [ ] Compare dashboard render time before/after
- [ ] Verify no memory leaks
- [ ] Test with large datasets (100+ requests)

## 🔍 Quality Checks

> ⚠️ **Critical**: Run quality checks on **modified files only** before marking
> the task as complete.

### Type Checking

```bash
# Check devtools package
deno check packages/devtools/**/*.ts packages/devtools/**/*.tsx
```

**What it checks:**

- React types are correctly imported
- Event handler signatures match React expectations
- No Hono JSX types remain

### Linting

```bash
# Lint devtools package
deno lint packages/devtools/
```

**What it checks:**

- No unused imports (old Hono JSX imports)
- Proper React conventions
- camelCase event handlers

### Test Suite

```bash
# Run devtools tests
deno test packages/devtools/tests/

# Run with coverage
deno test --coverage=coverage/ packages/devtools/tests/
deno coverage coverage/
```

**What it checks:**

- All existing tests still pass
- New React components render correctly
- No runtime errors

### Combined Check (Recommended)

```bash
# Run all checks
deno check packages/devtools/**/*.tsx && \
deno lint packages/devtools/ && \
deno test packages/devtools/tests/

# If all pass, migration is successful! ✅
```

## ✅ Definition of Done

- [ ] All configuration files updated (deno.json)
- [ ] All JSX components migrated to React syntax
- [ ] All event handlers converted (onclick → onClick, etc.)
- [ ] All SVG attributes converted (stroke-width → strokeWidth, etc.)
- [ ] CopyButton component refactored with React hooks
- [ ] Dashboard rendering uses ReactDOMServer
- [ ] All tests passing (unit + integration)
- [ ] Manual testing completed - all features work identically
- [ ] No console errors in browser
- [ ] Documentation updated (README, REFACTORING_SUMMARY)
- [ ] No breaking changes for users
- [ ] ✅ **Quality checks passed**:
  - [ ] `deno check packages/devtools/**/*.tsx` passes (no type errors)
  - [ ] `deno lint packages/devtools/` passes (no warnings)
  - [ ] `deno test packages/devtools/tests/` passes (100% success)
- [ ] Performance is equivalent or better
- [ ] Code reviewed and approved
- [ ] Version bumped to 0.1.23
- [ ] Commit messages document the migration

## 🔗 Related Tasks

- [devtools_ui_refactor.md](.tasks/devtools_ui_refactor.md) - Previous Tailwind
  to CSS refactor
- [frontend-architecture.md](.tasks/frontend-architecture.md) - Overall frontend
  strategy

## 📅 Timeline

- **Start Date**: 2026-01-16
- **Estimated Completion**: 2026-01-16 (2-3 hours)
- **Actual Completion**: [To be filled]

## 📝 Notes

### Why React Instead of Hono JSX?

**Benefits:**

- ✅ More familiar syntax for most developers
- ✅ Better IDE support and tooling
- ✅ Access to React ecosystem (hooks, dev tools)
- ✅ Easier to find examples and documentation
- ✅ More sophisticated state management (useState, etc.)

**Tradeoffs:**

- ⚠️ Slightly larger bundle size (but SSR only, so minimal impact)
- ⚠️ Additional npm dependencies (react, react-dom)

### Technical Considerations

**Server-Side Rendering Only:**

- No need for client-side React hydration
- No need for React Router or client-side state
- Keep it simple: pure SSR with inline event handlers

**Performance:**

- React SSR is well-optimized and battle-tested
- Should have negligible impact on render time
- Inline styles approach is unchanged

**Security:**

- No XSS concerns (server-rendered only)
- No client-side state to secure
- Same security posture as before

### Alternative Approaches Considered

1. **Keep Hono JSX**: Simpler, but less ecosystem support
2. **Use Preact**: Smaller bundle, but less tooling support
3. **Use Vue SSR**: Different syntax, more complex setup

**Decision**: React provides the best balance of ecosystem, tooling, and
familiarity.

---

## 🎓 Implementation Checklist

### Phase 1: Setup (15 minutes)

- [ ] Update deno.json configuration
- [ ] Add React dependencies
- [ ] Test that React imports work

### Phase 2: Component Migration (1.5 hours)

- [ ] Update CopyButton with React hooks (30 min)
- [ ] Batch update event handlers in all components (30 min)
- [ ] Update SVG attributes across all files (15 min)
- [ ] Update dashboard.tsx rendering (15 min)

### Phase 3: Testing (45 minutes)

- [ ] Run type checking (5 min)
- [ ] Run linting (5 min)
- [ ] Run unit tests (5 min)
- [ ] Manual testing of all features (30 min)

### Phase 4: Documentation (15 minutes)

- [ ] Update README.md
- [ ] Update REFACTORING_SUMMARY.md
- [ ] Commit with clear message

---

_Task created: 2026-01-16_ _Last updated: 2026-01-16_
