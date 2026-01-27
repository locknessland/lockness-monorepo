# Technical Task: Implement CSS Variable config for UI Components THEMING

## 📋 Task Overview

Implement a comprehensive theming system for all Lockness UI components using CSS variables. This will allow users to customize the look and feel of every component globally or locally by overriding specific CSS variables. All components should be updated to consume these variables, and the documentation (both `DOCS.md` and `examples.tsx`) must reflect the available customization points.

## 🎯 Objectives

1. **[CSS Variable Standardization]**: Ensure all UI components use CSS variables for their styling (colors, padding, border-radius, etc.) instead of hardcoded values or ad-hoc Tailwind classes.
2. **[Global Theme Configuration]**: Centralize default styling in `app/view/assets/app.css`.
3. **[Component Audit & Update]**: Review every component in `packages/ui/components` and update them to support theming via CSS variables.
4. **[Documentation]**: Document the available CSS variables for each component in its `DOCS.md` and `examples.tsx`.
5. **[Quality]**: Verify that components remain responsive and correctly handle both light and dark modes via the existing theme structure.

## 📁 Affected File Paths

### Core Files to Modify

- `app/view/assets/app.css` - Centralized theme variable definitions.

### Framework Files to Extend

- `packages/ui/components/[ComponentName]/mod.tsx` - Update to use CSS variables.
- `packages/ui/components/[ComponentName]/examples.tsx` - Add CSS variables documentation section.
- `packages/ui/components/[ComponentName]/DOCS.md` - Add "Theming" section.

## 🏗️ Architecture Principles

### SOLID Principles Application

**2. Open/Closed Principle (OCP)**

- **Solution**: Components are "closed" for modification but "open" for styling extension via CSS variables. Users can change the design without editing the component's source code.

### DRY Principle (Don't Repeat Yourself)

**Solution**: Use shared variables (e.g., `--radius`, `--border`) where applicable, but provide component-specific overrides (e.g., `--button-border-radius`) for fine-grained control.

## 📝 Detailed Implementation Steps

### Phase 1: Audit & Global Config

**Step 1.1: Audit Existing Components**

List all components in `packages/ui/components` and identify which ones are missing CSS variable support.

**Step 1.2: Update `app/view/assets/app.css`**

Add missing variables for components that don't have them yet. Group them logically (e.g., `/* Accordion customization */`).

### Phase 2: Component Implementation

**Step 2.1: Update Components**

For each component (e.g., `Accordion`, `Breadcrumb`, `Chart`, etc.):
- Update `mod.tsx` to use `var(--variable-name)` in Tailwind classes (using generic syntax like `bg-(--bg-var)` or `text-(length:--font-size-var)`).

### Phase 3: Documentation Updates

**Step 3.1: Update DOCS.md**

Add a "Theming" section to each component's `DOCS.md`:

```markdown
## Theming

| Variable | Default | Description |
|----------|---------|-------------|
| `--comp-bg` | `var(--muted)` | Background color |
| ... | ... | ... |
```

**Step 3.2: Update examples.tsx**

Add a section to `examples.tsx` that displays the available variables, possibly using a new `VariablesTable` component or extending `PropsTable`.

## 📚 Documentation Updates Checklist

- [ ] Update `app/view/assets/app.css` with all component variables
- [ ] Update documentation for the following components:
    - [ ] Accordion
    - [ ] Alert
    - [ ] Badge
    - [ ] Breadcrumb
    - [ ] Button
    - [ ] Card
    - [ ] Chart
    - [ ] Checkbox
    - [ ] CircularProgress
    - [ ] CodeBlock
    - [ ] GaugeProgress
    - [ ] Hero
    - [ ] Input
    - [ ] Kbd
    - [ ] Modal
    - [ ] Navbar
    - [ ] Newsletter
    - [ ] Pagination
    - [ ] Pricing
    - [ ] Progress
    - [ ] SearchBar
    - [ ] Separator
    - [ ] Sidebar
    - [ ] Skeleton
    - [ ] Spinner
    - [ ] SteppedProgress
    - [ ] Switch
    - [ ] Table
    - [ ] Tabs
    - [ ] Textarea
    - [ ] ThemeSwitch
    - [ ] Title
    - [ ] TreeView
    - [ ] UploadZone
    - [ ] Video

## 🧪 Testing Strategy

### Manual Testing

- [ ] Verify that changing a variable in `app.css` updates all instances of the component.
- [ ] Verify that local overrides work: `<div style="--button-primary: red;"><Button>Red Button</Button></div>`.
- [ ] Check that light/dark mode transitions still work correctly.

## 🔍 Quality Checks

- [ ] `deno check packages/ui/` passes.
- [ ] `deno lint packages/ui/` passes.
- [ ] Components are visually consistent.

## ✅ Definition of Done

- [ ] All components in `packages/ui/components` use CSS variables for their primary styles.
- [ ] `app/view/assets/app.css` contains the default values for all these variables.
- [ ] Each component's `DOCS.md` has a "Theming" section listing available variables.
- [ ] Each component's `examples.tsx` includes documentation for these variables.
- [ ] No hardcoded color or spacing values remain in component source files.

## 📅 Timeline

- **Start Date**: 2026-01-27
- **Estimated Completion**: 2026-02-03
