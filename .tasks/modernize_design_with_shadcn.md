# Task: Modernize Main Website Design with Shadcn UI Blocks

## Objective

Modernize the Lockness website (`app/view/pages/home.tsx`) by replacing the
current "Pixel" style design with a professional, modern design using Shadcn UI
blocks. The goal is to retain the existing content (features, value proposition,
code selection) but present it in a cleaner, more readable, and professional
manner.

## Architectural Constraints (STRICT)

- **SOLID & DRY Principles**: Strictly adhere to these principles.
- **Layered Architecture**:
  - **Controllers**: Must remain "thin". Delegate all business logic to
    Services.
  - **Services**: Handle business logic.
  - **Repositories**: Handle data persistence.
  - **Data Flow**: Controller -> Service -> Repository.
- **Prohibited**: Direct database queries in Controllers.
- **Dependency Injection**: Use `@Inject` for all dependencies.
- **Testing**:
  - Focus on **Unit Testing** for isolated components (Services, Helpers, maybe
    Components if applicable).
  - **Mock** all database operations.
  - **Avoid Functional Tests** for this task (UI focus).

## Prerequisite: Source Material

- **Source Blocks**: Located in `_shadcn-ui-blocks_/src/block`.
- **Source UI Components**: Located in `_shadcn-ui-blocks_/src/components/ui`.
- **Utilities**: `_shadcn-ui-blocks_/src/lib/utils.ts`.

## Step-by-Step Instructions

### 1. Infrastructure Setup

1. **Utility Helper**:
   - Port `_shadcn-ui-blocks_/src/lib/utils.ts` to `app/view/helpers/utils.ts`
     (or `class_names.ts`).
   - Ensure it works with Deno (remove Node specific imports if any, though
     likely just `clsx` and `tailwind-merge`).
   - Note: You may need to install `clsx` and `tailwind-merge` if not present
     (`deno add npm:clsx npm:tailwind-merge`).

2. **UI Component Library**:
   - Create a directory `app/view/components/ui`.
   - Port the following essential components from
     `_shadcn-ui-blocks_/src/components/ui`. Ensure compatibility with Hono JSX
     (use `class` instead of `className`, handle `ref` if needed, etc.):
     - `button.tsx`
     - `badge.tsx`
     - `card.tsx` (Card, CardHeader, CardContent, etc.)
     - `input.tsx` (if needed for CTA)
     - `sheet.tsx` (for mobile navigation)
     - `separator.tsx`
   - **Note on Icons**: Use `npm:lucide-react` for icons. Ensure they render
     correctly in the Deno/Hono environment.

### 2. Component Migration (Blocks)

Create a directory `app/view/components/blocks`. Port the following blocks,
transforming them into Hono JSX components.

**Mapping:**

- **Navigation**:
  - Port `_shadcn-ui-blocks_/src/block/navbar1.tsx` to
    `app/view/components/blocks/navbar.tsx`.
  - Maintain the existing links (Features, Getting Started, Examples, GitHub,
    DOCS/START).

- **Hero Section**:
  - Analyze `_shadcn-ui-blocks_/src/block/hero45.tsx` (typically text left,
    image/content right) or `hero1.tsx`.
  - Port the best fit to `app/view/components/blocks/hero.tsx`.
  - Replace the "image" slot with the **Code Preview** component (see below).
  - Keep the "Build fullstack apps at monster speed" text and buttons.

- **Stats Section**:
  - Port `_shadcn-ui-blocks_/src/block/stats8.tsx` to
    `app/view/components/blocks/stats.tsx`.
  - Content: MVC Architecture, TypeScript First Class, Deno 2.0 Native, Hono
    Powered.

- **Features Section**:
  - Port `_shadcn-ui-blocks_/src/block/feature1.tsx` (or similar grid layout) to
    `app/view/components/blocks/features.tsx`.
  - Map the existing 9 features (Layers, DI, Speed, Security, ORM, CLI, Auth,
    Mail, Jobs) to this block.

- **Code Sections (Getting Started / Examples)**:
  - Port `_shadcn-ui-blocks_/src/block/codeexample1.tsx` (or `content1.tsx` if
    more appropriate) to `app/view/components/blocks/code_section.tsx`.
  - Re-implement the Terminal preview and Code Examples using a modern Code
    Block styling (Shadcn usually has a clean Card based code block).

- **Footer**:
  - Port `_shadcn-ui-blocks_/src/block/footer2.tsx` to
    `app/view/components/blocks/footer.tsx`.

### 3. Page Assembly

1. **Refactor `Home.tsx`**:
   - Update `app/view/pages/home.tsx`.
   - Remove the "Pixel" specific styles and custom SVGs (unless reused inside
     the new blocks).
   - Import and compose the page using the new Blocks (`<Navbar />`, `<Hero />`,
     `<Stats />`, `<Features />`, `<Footer />`).
   - Ensure the layout uses `app/view/layouts/landing_layout.tsx` (update the
     layout if it has conflicting styles).

### 4. Code Quality & Cleanup

- **CSS/Tailwind**:
  - Ensure all `className` attributes are converted to `class`.
  - Remove `framer-motion` if it's too heavy/complex for Deno/Hono, or replace
    with simple CSS transitions/`animate-` classes. If `framer-motion` is
    strictly required by the blocks, check compatibility or strip it down to CSS
    animations. **Preference: CSS Animations for simplicity and speed.**
- **Strict types**: Ensure all components are typed (Props).

## Expected Output

- A modernized `home.tsx` that looks professional and clean.
- A set of reusable UI components in `app/view/components/ui`.
- A set of specific blocks in `app/view/components/blocks`.
- Tests: Add unit tests for at least one Complex Component (e.g.,
  `Features.tsx`) ensuring it renders the correct number of items. **Mock** any
  dependencies.
