# Technical Task: Video Component for @lockness/ui

## 📋 Task Overview

Create a reusable Video component for the `@lockness/ui` package that provides a
consistent, accessible, and styled video player for the Lockness framework. This
component will support various video sources, controls, and responsive layouts.

## 🎯 Objectives

1. **Primary Objective**: Create a Video component with native HTML5 video
   support
2. **Secondary Objective**: Support multiple video sources and formats
3. **Additional Objective**: Provide responsive sizing and aspect ratio options
4. **Quality Objective**: Ensure accessibility with proper ARIA attributes
5. **Documentation Objective**: Document all props and usage examples

## 📁 Affected File Paths

### New Files to Create

- `/packages/ui/components/Video/mod.tsx` - Main Video component
- `/packages/ui/components/Video/examples.tsx` - Usage examples
- `/packages/ui/components/Video/DOCS.md` - Component documentation
- `/app/view/pages/ui/video.tsx` - Demo page for Video component

### Framework Files to Extend

- `/packages/ui/components.ts` - Export Video component
- `/app/view/components/ui-sidebar.tsx` - Add Video to sidebar navigation

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/ui/README.md` - Document Video component API

#### User Documentation (Package Docs)

- `/packages/ui/components/Video/DOCS.md` - Component documentation

#### LLM Documentation

- `/public/ui/llms/video.txt` - Add Video component to LLM-optimized docs

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

```tsx
import { Video } from '@lockness/ui/components'

// Basic usage
<Video src='/videos/demo.mp4' />

// With poster
<Video
    src='/videos/demo.mp4'
    poster='/img/poster.jpg'
    controls
/>
```

### Target User-Facing API (Advanced Version)

```tsx
import { Video } from '@lockness/ui/components'

// Multiple sources with fallback
<Video
    sources={[
        { src: '/videos/demo.webm', type: 'video/webm' },
        { src: '/videos/demo.mp4', type: 'video/mp4' },
    ]}
    poster="/img/poster.jpg"
    controls
    autoplay
    muted
    loop
    aspectRatio="16/9"
    class="rounded-lg shadow-lg"
/>

// With custom fallback content
<Video src="/videos/demo.mp4" controls>
    <p>Your browser does not support the video tag.</p>
</Video>
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Video Component

**Step 1.1: Create Video Component**

File: `/packages/ui/components/media/video.tsx`

````tsx
/**
 * @fileoverview Video component for displaying video content.
 *
 * Provides a styled, accessible video player with support for
 * multiple sources, controls, and responsive layouts.
 *
 * @module @lockness/ui/components/media/video
 */

import type { FC, PropsWithChildren } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Video source configuration
 */
export interface VideoSource {
    /** Video file URL */
    src: string
    /** MIME type (e.g., 'video/mp4', 'video/webm') */
    type?: string
}

/**
 * Video component props
 */
export interface VideoProps extends PropsWithChildren {
    /** Single video source URL */
    src?: string
    /** Multiple video sources for format fallback */
    sources?: VideoSource[]
    /** Poster image URL shown before playback */
    poster?: string
    /** Show video controls */
    controls?: boolean
    /** Autoplay video (requires muted for most browsers) */
    autoplay?: boolean
    /** Mute video audio */
    muted?: boolean
    /** Loop video playback */
    loop?: boolean
    /** Play video inline on mobile */
    playsinline?: boolean
    /** Preload behavior: 'none' | 'metadata' | 'auto' */
    preload?: 'none' | 'metadata' | 'auto'
    /** Aspect ratio (e.g., '16/9', '4/3', '1/1') */
    aspectRatio?: '16/9' | '4/3' | '1/1' | '21/9' | string
    /** Video width */
    width?: number | string
    /** Video height */
    height?: number | string
    /** Additional CSS classes */
    class?: string
    /** Accessible label for the video */
    'aria-label'?: string
}

/**
 * Aspect ratio CSS class mapping
 */
const aspectRatioClasses: Record<string, string> = {
    '16/9': 'aspect-video',
    '4/3': 'aspect-[4/3]',
    '1/1': 'aspect-square',
    '21/9': 'aspect-[21/9]',
}

/**
 * Video component for displaying video content.
 *
 * Supports single or multiple sources, native controls,
 * and responsive aspect ratios.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Video src="/videos/demo.mp4" controls />
 *
 * // With multiple sources
 * <Video
 *     sources={[
 *         { src: '/videos/demo.webm', type: 'video/webm' },
 *         { src: '/videos/demo.mp4', type: 'video/mp4' },
 *     ]}
 *     poster="/img/poster.jpg"
 *     controls
 *     aspectRatio="16/9"
 * />
 * ```
 */
export const Video: FC<VideoProps> = ({
    src,
    sources,
    poster,
    controls = true,
    autoplay = false,
    muted = false,
    loop = false,
    playsinline = true,
    preload = 'metadata',
    aspectRatio,
    width,
    height,
    class: className,
    'aria-label': ariaLabel,
    children,
}) => {
    const aspectClass = aspectRatio
        ? aspectRatioClasses[aspectRatio] || `aspect-[${aspectRatio}]`
        : ''

    return (
        <video
            class={cn(
                'w-full bg-black',
                aspectClass,
                className,
            )}
            poster={poster}
            controls={controls}
            autoplay={autoplay}
            muted={muted}
            loop={loop}
            playsinline={playsinline}
            preload={preload}
            width={width}
            height={height}
            aria-label={ariaLabel}
        >
            {src && <source src={src} />}
            {sources?.map((source) => (
                <source
                    key={source.src}
                    src={source.src}
                    type={source.type}
                />
            ))}
            {children || 'Your browser does not support the video tag.'}
        </video>
    )
}
````

**Step 1.2: Create Media Module Export**

File: `/packages/ui/components/media/mod.ts`

```tsx
/**
 * @fileoverview Media components barrel export.
 *
 * @module @lockness/ui/components/media
 */

export { Video } from './video.tsx'
export type { VideoProps, VideoSource } from './video.tsx'
```

**Step 1.3: Update Main Exports**

Add to `/packages/ui/components/mod.ts`:

```tsx
// Media
export * from './media/mod.ts'
```

## ✅ Definition of Done

- [ ] Video component created with all props
- [ ] Support for single and multiple sources
- [ ] Responsive aspect ratio support
- [ ] Accessibility attributes (aria-label)
- [ ] Fallback content for unsupported browsers
- [ ] JSDoc documentation complete
- [ ] Exported from @lockness/ui/components
- [ ] Type safety enforced (no `any` types)
- [ ] `deno check` passes
- [ ] `deno lint` passes

## 📝 Notes

- The component uses native HTML5 video for maximum compatibility
- Autoplay requires `muted` attribute for most browsers due to autoplay policies
- `playsinline` is important for iOS Safari to prevent fullscreen on play
- Aspect ratio uses Tailwind CSS classes for responsive sizing

---

_Task created: 2026-01-23_
