# Technical Task: Implement UI Component Showcase Page

## 📋 Task Overview

Create a dedicated "UI Showcase" page within the application to visualize, test,
and demonstrate all available `@lockness/ui` components. This page will serve as
a living style guide or design system reference, allowing developers to see how
components render in the actual application environment. It will directly
utilize the library mode exports from `@lockness/ui/components`.

## 🎯 Objectives

1. **Route Handling**: Implement a `UiController` to serve the showcase at
   `/ui`.
2. **Visual Documentation**: Create a view that groups components by type
   (Buttons, Cards, etc.).
3. **Variant coverage**: Display all available variants and states for each
   component (e.g., Primary, Ghost, Disabled Buttons).
4. **Library Usage**: Demonstrate the usage of library mode imports
   (`from '@lockness/ui/components'`).

## 📁 Affected File Paths

### New Files to Create

- `/app/controller/UiController.tsx` - Controller handling the `/ui` route.
- `/app/view/pages/ui/index.tsx` - The main view file rendering the component
  list.

## 🏗️ Architecture Principles

- **Separation of Concerns**: Keep the showcase logic isolated from the main
  application business logic.
- **Dogfooding**: The showcase page itself should be built using the
  `RootLayout` and other UI primitives it demonstrates.

## 📝 Detailed Implementation Steps

### Phase 1: Controller Setup

**Step 1.1: Create UiController**

File: `/app/controller/UiController.ts`

```typescript
import { Controller, Get } from '@lockness/core'
import { UiIndex } from '@view/pages/ui/index.tsx'

@Controller('/ui')
export class UiController {
    @Get('/')
    public index() {
        return UiIndex()
    }
}
```

### Phase 2: View Implementation

**Step 2.1: Create Basic Layout**

File: `/app/view/pages/ui/index.tsx`

Use `RootLayout` from `@lockness/ui/components` as the wrapper.

**Step 2.2: Add Component Sections**

Import components from `@lockness/ui/components` and create sections for each.

```tsx
import {
    Button,
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    RootLayout,
} from '@lockness/ui/components'

export const UiIndex = () => {
    return (
        <RootLayout title='UI Showcase'>
            <div class='container mx-auto p-8 space-y-12'>
                <header>
                    <h1 class='text-3xl font-bold mb-4'>
                        Lockness UI Components
                    </h1>
                    <p class='text-gray-600'>
                        A showcase of all available components.
                    </p>
                </header>

                {/* Buttons Section */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-semibold border-b pb-2'>
                        Buttons
                    </h2>
                    <div class='flex flex-wrap gap-4 items-center'>
                        <Button variant='primary'>Primary</Button>
                        <Button variant='secondary'>Secondary</Button>
                        <Button variant='outline'>Outline</Button>
                        <Button variant='ghost'>Ghost</Button>
                        <Button variant='danger'>Danger</Button>
                        <Button disabled>Disabled</Button>
                    </div>
                    <div class='flex flex-wrap gap-4 items-center'>
                        <Button size='sm'>Small</Button>
                        <Button size='md'>Medium</Button>
                        <Button size='lg'>Large</Button>
                    </div>
                </section>

                {/* Cards Section */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-semibold border-b pb-2'>Cards</h2>
                    <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <Card>
                            <CardHeader>
                                <CardTitle>Card Title</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p>This is a standard card content area.</p>
                            </CardContent>
                            <CardFooter>
                                <Button variant='outline' class='w-full'>
                                    Action
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </section>
            </div>
        </RootLayout>
    )
}
```

### Phase 3: Registration

**Step 3.1: Route Generation**

Ensure the new controller is picked up by running `deno task routes:generate`
(or verify it happens automatically in dev mode).

## 🔍 Quality Checks

- [ ] Page loads successfully at `/ui`.
- [ ] All component variants render correctly with Tailwind styles.
- [ ] Unpoly integration works (e.g., page navigation if any).
- [ ] No type errors in specific files.

## ✅ Definition of Done

- [ ] `UiController` is created.
- [ ] Showcase page renders all `@lockness/ui` components (Button, Card, etc.).
- [ ] Page uses the standard `RootLayout`.
