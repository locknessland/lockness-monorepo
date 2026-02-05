# UI Components Documentation Refactor

## 🎯 Objective

Refactor the documentation of all UI components to ensure a clear separation of
concerns and avoid redundancy while maximizing utility for both users and LLMs.

## 📝 Strategy

1. **`DOCS.md`**: Should be the single source of truth for technical
   documentation.
   - **Priority**: Installation instructions must be prominent at the top.
   - Detailed description.
   - Props table (API).
   - LLM-specific guidelines/context.
   - Theming/CSS Variables documentation.
2. **`examples.tsx`**: Should focus on **demonstration**.
   - **Ordering**: Must render the content of `DOCS.md` **FIRST**, followed by
     the examples.
   - Should contain concrete, real-world usage examples (scenarios).
   - Remove any redundant static text that is already in `DOCS.md`.

## 📋 Task List

Review and refactor the documentation for the following components:

- [ ] Accordion
- [ ] Alert
- [ ] Badge
- [ ] Breadcrumb
- [ ] Button
- [ ] Card
- [ ] Chart
- [ ] ChartExtras
- [ ] Checkbox
- [ ] CircularProgress
- [ ] CodeBlock
- [ ] CopyButton
- [ ] FeatureCard
- [ ] Footer
- [ ] Gallery
- [ ] GaugeProgress
- [ ] Hero
- [ ] Input
- [ ] Kbd
- [ ] Label
- [ ] Link
- [ ] Modal
- [ ] Navbar
- [ ] Newsletter
- [ ] Pagination
- [ ] Pricing
- [ ] Progress
- [ ] PropsTable
- [ ] RootLayout
- [ ] SearchBar
- [ ] Section
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

## 🔄 Workflow

For each component:

1. Check `examples.tsx` and move generic information to `DOCS.md`.
2. Ensure `examples.tsx` imports and renders `DOCS.md` content (mechanism to be
   implemented/verified).
3. Verify `examples.tsx` has at least 3 distinct real-world usage scenarios.
4. Verify `DOCS.md` contains the Props Table and valid syntax/examples for LLM
   consumption.
