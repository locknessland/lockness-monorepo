---
name: tailwind
description: Expert guidance on Tailwind CSS V4 syntax, specifically focusing on the correct usage of CSS variables.
---

# Tailwind CSS V4 Expert

This skill provides mandatory guidelines for using Tailwind CSS V4 in this
project. You must follow these rules whenever you write or modify Tailwind CSS
classes.

## 🚨 CRITICAL RULE: CSS Variables Syntax

In Tailwind CSS V4, when using CSS variables as values for utility classes, you
**MUST use parentheses `()`**, not brackets `[]`.

### ✅ Correct Usage

Use parentheses for CSS variables:

- `bg-(--my-color)`
- `text-(--text-primary)`
- `gap-(--spacing-4)`
- `w-(--sidebar-width)`
- `border-(--border-color)`

### ❌ Incorrect Usage (DO NOT USE)

Do NOT use brackets for CSS variables. These will be treated as literal strings
or invalid values:

- `bg-[--my-color]`
- `text-[--text-primary]`
- `gap-[--spacing-4]`

## ⚠️ Special Cases

### Font Size

When using a CSS variable for font size, you must use the `length:` modifier
within brackets if the variable represents a length:

- `text-[length:--font-size-base]`
- `text-[length:--text-xl]`

### Opacity

To apply opacity to a color variable, use the slash `/` syntax after the
parentheses:

- `bg-(--primary)/50`
- `text-(--secondary)/80`
- `border-(--accent)/20`

### Arbitrary Values (Non-Variables)

Brackets `[]` are still used for arbitrary literal values (pixels, rems,
percentages, etc.), just not for CSS variables:

- `w-[350px]` (Correct: literal value)
- `mt-[10.5rem]` (Correct: literal value)
- `bg-[#ff0000]` (Correct: literal hex color)

## Summary Table

| Intent                | Syntax                    | Example                   |
| :-------------------- | :------------------------ | :------------------------ |
| **Use CSS Variable**  | `utility-(--var)`         | `p-(--spacing-4)`         |
| **Arbitrary Literal** | `utility-[value]`         | `p-[16px]`                |
| **Font Size Var**     | `text-[length:--var]`     | `text-[length:--size-lg]` |
| **Opacity**           | `utility-(--var)/opacity` | `bg-(--brand)/50`         |

## Verification Checklist

Before finalizing any Tailwind CSS code, verify:

1. Are there any `[` containing `--`? (e.g. `-[--`)
   - If yes, check if it is a `text-[length:--` case.
   - If not `length:`, it is likely an **ERROR**. Change `[]` to `()`.
2. Are you using a CSS variable? Ensure it is wrapped in `()`, e.g., `-(--var)`.
