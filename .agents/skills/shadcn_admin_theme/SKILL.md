---
name: shadcn_admin_theme
description: Guidelines for styling dashboards and panels using the shadcn-admin UI theme
---

# Shadcn-Admin Theme Guidelines

When creating or modifying dashboard panels or UI components in this project, always adhere to the `shadcn-admin` design system.

## Core Principles

1. **Use Standard Components**: Use `shadcn-admin` standard components (e.g., `Card`, `Button`, `Badge`, `Input`, `Select`, `Textarea`, `Table`) instead of custom-styled HTML elements.
2. **Avoid Neumorphism**: Do NOT use custom CSS shadows, bold black borders, or heavy neumorphic styling (e.g., `shadow-[4px_4px_0px_black]`, `border-2 border-black`, `rounded-[24px]`).
3. **Clean Layouts**: 
   - Use `Card`, `CardHeader`, `CardTitle`, `CardDescription`, and `CardContent` for grouping content.
   - Use `Badge` for statuses (with variants like `default`, `secondary`, `outline`, `destructive`).
   - Wrap main dashboard content in `<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">`.
   - Page headers should be inside `<div className="flex items-center justify-between space-y-2 mb-8">`.
4. **Forms**: Use standard `Label` and `Input`/`Textarea`/`Select` components inside a `space-y-4` container.
5. **Tables**: Use standard `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, and `TableCell` for displaying tabular data.
