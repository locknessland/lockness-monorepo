# Technical Task: Refactor Devtools UI to Pure CSS & Atomic Components

## 📋 Task Overview

The current Devtools UI relies on an embedded Tailwind CSS string generated via
a build script. This adds unnecessary complexity (build steps, cache issues,
poor DX) for a development tool that should be "zero-config".

We will remove the Tailwind dependency completely and switch to **Pure CSS /
Inline Styles** (CSS-in-JS style) encapsulated within small, atomic JSX
components. This ensures the devtools package is standalone, performant, and
easy to maintain without external build tools.

## 🎯 Objectives

1. **[Primary] Remove Tailwind Dependency**: Delete all Tailwind build scripts,
   config, and the `styles.ts` injection mechanism.
2. **[Primary] Atomic Component Architecture**: Break down complex panels into
   small, reusable components (e.g., `<Button>`, `<Panel>`, `<Table>`,
   `<Badge>`).
3. **[Secondary] Styling Strategy**: Use scoped `style` objects or embedded
   `<style>` tags with unique class prefixes (e.g., `ln-dev-*`) to prevent style
   leaks.
4. **[Quality] Responsive Design**: Re-implement responsive behavior
   (Desktop/Mobile layouts) using standard CSS Media Queries / Flexbox / Grid.

## 📁 Affected File Paths

### Core Files to Remove/Clean

- `packages/devtools/ui/styles.ts` (Delete or replace with base CSS reset)
- `packages/devtools/ui/input.css` (Delete)
- `packages/devtools/scripts/build_css.ts` (Delete)

### UI Components to Refactor (Tailwind -> Pure CSS)

- `packages/devtools/ui/Layout.tsx`
- `packages/devtools/ui/Dashboard.tsx`
- `packages/devtools/ui/components/*.tsx`
  - `Navbar.tsx`, `NavTabs.tsx`, `Separator.tsx`
  - `MetadataCard.tsx`
  - `BackToAppButton.tsx`, `ClearDataButton.tsx`
  - `Badge.tsx`
- `packages/devtools/ui/panels/*.tsx`
  - `Requests.tsx` (Heavy refactoring needed here)
  - `Overview.tsx`
  - `Routes.tsx`, `Deprecations.tsx`

### Toolbar Components

- `packages/devtools/components/toolbar.tsx` (Ensure consistent styling with
  dashboard)
- `packages/devtools/components/request-info.tsx`

## 🏗️ Architecture Principles

### 1. Atomic Design

Every UI element used more than once (or complex enough) becomes a component.

- **Atoms**: `Button`, `Icon`, `Text`, `Badge`, `Card`
- **Molecules**: `RequestRow`, `MetadataItem`, `NavBar`
- **Organisms**: `RequestPanel`, `OverviewPanel`

### 2. Scoped Styling

Use a consistent prefix (`ln-devtools-`) for classes if using a `<style>` block,
or inline styles for dynamic values.

```tsx
// Example: Atomic Button
export const Button = ({ children, onClick, variant = 'primary' }) => {
    const styles = {
        padding: '0.5rem 1rem',
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        backgroundColor: variant === 'primary' ? '#2563eb' : '#374151',
        color: 'white',
    }
    return <button style={styles} onClick={onClick}>{children}</button>
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Clean Up & Base Structure

1. Remove Tailwind build scripts and tasks (Done).
2. Delete `input.css` and `build_css.ts`.
3. Create a **Theme Constant** file (`packages/devtools/ui/theme.ts`) to store
   colors (gray-50, gray-900, etc.) and common spacing/sizes, to maintain the
   current visual identity.

### Phase 2: Create Atomic Core Components

Create a new `packages/devtools/ui/atoms/` directory.

1. `Button.tsx` (Secondary, Primary, Danger, Ghost)
2. `Card.tsx` (Container with standard borders/bg)
3. `Badge.tsx` (Status indicators)
4. `Typography.tsx` (Headings, Monospace code, Label)

### Phase 3: Component Migration

Refactor existing "Big Components" to use the new Atoms.

1. **MetadataCard**: Rewrite using `Card`, `Typography`, `Button`.
2. **Navbar**: Rewrite using Flexbox styles and `Button`.
3. **Panels**:
   - `Requests.tsx`: Replace the Tailwind Grid with CSS Grid/Flexbox manually.
     Split the "Headers Table" into a `Table` component.

### Phase 4: Final Polish

1. Ensure `Layout.tsx` injects a minimal generic CSS Reset (e.g.,
   `box-sizing: border-box`, generic fonts) so components look consistent
   regardless of the user's app styles.

## 🔍 Quality Checks

- ✅ No `className="text-gray-500 hover:bg-..."` remaining in code.
- ✅ Dashboard looks identical (or better) than the current version.
- ✅ Check responsiveness (resize window) - `Requests` panel should stack
  columns on mobile.
- ✅ `deno check` passes on `packages/devtools`.

## 🔄 Migration Guide

Internal refactor only. No breaking changes for end users (API remains
`enableDevtools(app)`).
