/**
 * DEPRECATED: This file is no longer needed.
 * The devtools UI now uses pure CSS with inline styles.
 *
 * This file is kept only for backward compatibility and will be removed in a future version.
 * All styling is now managed through:
 * - theme.ts: Design tokens and CSS reset
 * - Inline styles in components
 * - Scoped <style> tags where needed for media queries
 */

// Re-export the CSS reset from theme.ts for any legacy code
export { cssReset as TAILWIND_CSS } from './theme.ts'
