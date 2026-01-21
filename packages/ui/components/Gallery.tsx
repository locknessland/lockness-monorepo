/**
 * @fileoverview Image gallery component with grid and masonry layouts.
 *
 * Responsive gallery with lightbox support and multiple layout options.
 *
 * @module @lockness/ui/components/gallery
 */

import type { FC, PropsWithChildren } from '@lockness/core'
import { cn } from '../lib/utils.ts'

// ============================================================================
// Gallery Grid
// ============================================================================

export interface GalleryGridProps {
    /** Number of columns */
    cols?: 2 | 3 | 4 | 5 | 6
    /** Gap between items */
    gap?: 'none' | 'sm' | 'md' | 'lg'
    /** Additional class names */
    class?: string
}

const gridColsVariants = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
}

const gapVariants = {
    none: 'gap-0',
    sm: 'gap-1',
    md: 'gap-2',
    lg: 'gap-4',
}

/**
 * GalleryGrid - A responsive grid layout for gallery images
 */
export const GalleryGrid: FC<PropsWithChildren<GalleryGridProps>> = ({
    cols = 3,
    gap = 'md',
    class: className,
    children,
}) => {
    return (
        <div
            class={cn(
                'grid',
                gridColsVariants[cols],
                gapVariants[gap],
                className,
            )}
        >
            {children}
        </div>
    )
}

// ============================================================================
// Gallery Justified
// ============================================================================

/**
 * Available row heights for the justified gallery layout.
 * Controls the fixed height of each row - width is determined by aspect ratios.
 *
 * | Value | Height |
 * |-------|--------|
 * | `xs`  | 80px   |
 * | `sm`  | 112px  |
 * | `md`  | 144px  |
 * | `lg`  | 192px  |
 * | `xl`  | 256px  |
 */
export type GalleryJustifiedRowHeight = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Available gap sizes between gallery items.
 *
 * | Value  | Gap   |
 * |--------|-------|
 * | `none` | 0     |
 * | `sm`   | 4px   |
 * | `md`   | 8px   |
 * | `lg`   | 16px  |
 */
export type GalleryJustifiedGap = 'none' | 'sm' | 'md' | 'lg'

/**
 * Props for the {@link GalleryJustified} component.
 *
 * @example
 * ```tsx
 * <GalleryJustified rowHeight="lg" gap="md">
 *   <GalleryJustifiedItem src="/photo.jpg" ratio="wide" />
 * </GalleryJustified>
 * ```
 */
export interface GalleryJustifiedProps {
    /**
     * Height of each row in the gallery.
     * Images will maintain their aspect ratio while fitting this height.
     * @default 'md'
     */
    readonly rowHeight?: GalleryJustifiedRowHeight

    /**
     * Gap between items in the gallery.
     * @default 'md'
     */
    readonly gap?: GalleryJustifiedGap

    /**
     * Additional CSS class names to apply to the container.
     */
    readonly class?: string
}

/** @internal CSS classes for each row height variant */
const justifiedRowHeightVariants = {
    xs: '[&>*]:h-20',
    sm: '[&>*]:h-28',
    md: '[&>*]:h-36',
    lg: '[&>*]:h-48',
    xl: '[&>*]:h-64',
} as const satisfies Record<GalleryJustifiedRowHeight, string>

/**
 * A justified gallery layout component inspired by Flickr and Google Photos.
 *
 * Images with variable aspect ratios are arranged horizontally and stretch
 * proportionally to fill each row completely. When items don't fit on a row,
 * they wrap to the next line.
 *
 * @remarks
 * - Use with {@link GalleryJustifiedItem} for best results
 * - Each row has a fixed height, widths are calculated from aspect ratios
 * - Items grow proportionally to fill the available width
 *
 * @example Basic usage
 * ```tsx
 * import { GalleryJustified, GalleryJustifiedItem } from '@lockness/ui/components'
 *
 * <GalleryJustified rowHeight="lg" gap="md">
 *   <GalleryJustifiedItem src="/photo1.jpg" ratio="wide" />
 *   <GalleryJustifiedItem src="/photo2.jpg" ratio="portrait" />
 *   <GalleryJustifiedItem src="/photo3.jpg" ratio="square" />
 * </GalleryJustified>
 * ```
 *
 * @example Different row heights
 * ```tsx
 * <GalleryJustified rowHeight="xs">...</GalleryJustified>  // 80px rows
 * <GalleryJustified rowHeight="xl">...</GalleryJustified>  // 256px rows
 * ```
 *
 * @see {@link GalleryJustifiedItem} - Image item component for this layout
 * @see {@link GalleryGrid} - For uniform grid layouts
 * @see {@link GalleryMasonry} - For Pinterest-style column layouts
 */
export const GalleryJustified: FC<PropsWithChildren<GalleryJustifiedProps>> = ({
    rowHeight = 'md',
    gap = 'md',
    class: className,
    children,
}) => {
    return (
        <div
            class={cn(
                'flex flex-wrap *:grow',
                gapVariants[gap],
                justifiedRowHeightVariants[rowHeight],
                className,
            )}
        >
            {children}
        </div>
    )
}

// ============================================================================
// Gallery Justified Item
// ============================================================================

/**
 * Available aspect ratios for gallery items.
 *
 * | Value       | Ratio | Description            |
 * |-------------|-------|------------------------|
 * | `tall`      | 2:3   | Vertical/portrait      |
 * | `portrait`  | 3:4   | Standard portrait      |
 * | `square`    | 1:1   | Square                 |
 * | `landscape` | 4:3   | Standard landscape     |
 * | `wide`      | 16:9  | Widescreen             |
 * | `ultrawide` | 21:9  | Cinematic/ultrawide    |
 */
export type GalleryJustifiedItemRatio =
    | 'tall'
    | 'portrait'
    | 'square'
    | 'landscape'
    | 'wide'
    | 'ultrawide'

/**
 * Available border radius options for gallery items.
 *
 * | Value     | Description                              |
 * |-----------|------------------------------------------|
 * | `none`    | No border radius                         |
 * | `default` | Uses the global `--radius` CSS variable  |
 * | `sm`      | Small border radius                      |
 * | `md`      | Medium border radius                     |
 * | `lg`      | Large border radius                      |
 */
export type GalleryJustifiedItemRounded =
    | 'none'
    | 'default'
    | 'sm'
    | 'md'
    | 'lg'

/**
 * Props for the {@link GalleryJustifiedItem} component.
 *
 * @example
 * ```tsx
 * <GalleryJustifiedItem
 *   src="/photo.jpg"
 *   alt="Mountain landscape"
 *   ratio="wide"
 *   rounded="md"
 * />
 * ```
 */
export interface GalleryJustifiedItemProps {
    /**
     * Image source URL.
     * @required
     */
    readonly src: string

    /**
     * Alternative text for the image.
     * Important for accessibility and SEO.
     * @default 'Gallery image'
     */
    readonly alt?: string

    /**
     * Aspect ratio of the image container.
     * Determines the proportional width based on the row height.
     * @default 'landscape'
     */
    readonly ratio?: GalleryJustifiedItemRatio

    /**
     * Border radius of the image container.
     * Use `'default'` to follow the global `--radius` CSS variable.
     * @default 'default'
     */
    readonly rounded?: GalleryJustifiedItemRounded

    /**
     * Additional CSS class names to apply to the container.
     */
    readonly class?: string
}

/** @internal CSS classes for each aspect ratio variant */
const justifiedItemRatioVariants = {
    portrait: 'aspect-[3/4]',
    tall: 'aspect-[2/3]',
    square: 'aspect-square',
    landscape: 'aspect-[4/3]',
    wide: 'aspect-[16/9]',
    ultrawide: 'aspect-[21/9]',
} as const satisfies Record<GalleryJustifiedItemRatio, string>

/**
 * An image item component for use within {@link GalleryJustified}.
 *
 * Displays an image with a configurable aspect ratio. The image is
 * lazy-loaded and uses `object-cover` to fill its container while
 * maintaining its natural proportions.
 *
 * @remarks
 * - Images are lazy-loaded by default for performance
 * - The container height is inherited from the parent {@link GalleryJustified}
 * - Width is calculated based on the `ratio` prop
 *
 * @example Basic usage
 * ```tsx
 * <GalleryJustifiedItem src="/photo.jpg" ratio="wide" />
 * ```
 *
 * @example With all props
 * ```tsx
 * <GalleryJustifiedItem
 *   src="/landscape.jpg"
 *   alt="Beautiful mountain view"
 *   ratio="ultrawide"
 *   rounded="lg"
 *   class="shadow-lg"
 * />
 * ```
 *
 * @example Different ratios
 * ```tsx
 * <GalleryJustifiedItem ratio="tall" />       // 2:3 vertical
 * <GalleryJustifiedItem ratio="portrait" />   // 3:4 portrait
 * <GalleryJustifiedItem ratio="square" />     // 1:1 square
 * <GalleryJustifiedItem ratio="landscape" />  // 4:3 landscape
 * <GalleryJustifiedItem ratio="wide" />       // 16:9 widescreen
 * <GalleryJustifiedItem ratio="ultrawide" />  // 21:9 cinematic
 * ```
 *
 * @see {@link GalleryJustified} - Parent container component
 */
export const GalleryJustifiedItem: FC<GalleryJustifiedItemProps> = ({
    src,
    alt = 'Gallery image',
    ratio = 'landscape',
    rounded = 'default',
    class: className,
}) => {
    return (
        <div
            class={cn(
                'relative overflow-hidden h-full',
                justifiedItemRatioVariants[ratio],
                roundedVariants[rounded],
                className,
            )}
        >
            <img
                class='absolute inset-0 w-full h-full object-cover'
                src={src}
                alt={alt}
                loading='lazy'
            />
        </div>
    )
}

// ============================================================================
// Gallery Masonry
// ============================================================================

export interface GalleryMasonryProps {
    /** Number of columns */
    cols?: 2 | 3 | 4 | 5
    /** Gap between items */
    gap?: 'none' | 'sm' | 'md' | 'lg'
    /** Additional class names */
    class?: string
}

/**
 * GalleryMasonry - A masonry-style layout container
 * Children should be GalleryMasonryColumn components
 */
export const GalleryMasonry: FC<PropsWithChildren<GalleryMasonryProps>> = ({
    cols = 4,
    gap = 'md',
    class: className,
    children,
}) => {
    return (
        <div
            class={cn(
                'grid',
                gridColsVariants[cols],
                gapVariants[gap],
                className,
            )}
        >
            {children}
        </div>
    )
}

// ============================================================================
// Gallery Masonry Column
// ============================================================================

export interface GalleryMasonryColumnProps {
    /** Gap between items in the column */
    gap?: 'none' | 'sm' | 'md' | 'lg'
    /** Additional class names */
    class?: string
}

const columnGapVariants = {
    none: 'space-y-0',
    sm: 'space-y-1',
    md: 'space-y-2',
    lg: 'space-y-4',
}

/**
 * GalleryMasonryColumn - A column for masonry layout
 */
export const GalleryMasonryColumn: FC<
    PropsWithChildren<GalleryMasonryColumnProps>
> = ({
    gap = 'md',
    class: className,
    children,
}) => {
    return (
        <div class={cn(columnGapVariants[gap], className)}>
            {children}
        </div>
    )
}

// ============================================================================
// Gallery Item
// ============================================================================

export interface GalleryItemProps {
    /** Image source URL */
    src: string
    /** Image alt text */
    alt?: string
    /** Link URL when clicked */
    href?: string
    /** Show hover overlay */
    showOverlay?: boolean
    /** Custom overlay content */
    overlayContent?: 'view' | 'zoom' | 'expand' | 'none'
    /** Custom overlay text */
    overlayText?: string
    /** Image aspect ratio */
    aspect?: 'square' | 'video' | 'auto'
    /** Border radius */
    rounded?: 'none' | 'default' | 'sm' | 'md' | 'lg' | 'full'
    /** Additional class names */
    class?: string
    /** Additional image class names */
    imageClass?: string
}

const aspectVariants = {
    square: 'aspect-square',
    video: 'aspect-video',
    auto: 'h-auto',
}

const roundedVariants = {
    none: 'rounded-none',
    default: 'rounded-(--radius)',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
}

// Icons
const ViewIcon = () => (
    <svg
        class='shrink-0 size-3'
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <circle cx='11' cy='11' r='8' />
        <path d='m21 21-4.3-4.3' />
    </svg>
)

const ZoomIcon = () => (
    <svg
        class='shrink-0 size-3'
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <circle cx='11' cy='11' r='8' />
        <path d='m21 21-4.3-4.3' />
        <path d='M11 8v6' />
        <path d='M8 11h6' />
    </svg>
)

const ExpandIcon = () => (
    <svg
        class='shrink-0 size-3'
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M15 3h6v6' />
        <path d='M9 21H3v-6' />
        <path d='M21 3l-7 7' />
        <path d='M3 21l7-7' />
    </svg>
)

const getOverlayIcon = (type: GalleryItemProps['overlayContent']) => {
    switch (type) {
        case 'view':
            return <ViewIcon />
        case 'zoom':
            return <ZoomIcon />
        case 'expand':
            return <ExpandIcon />
        default:
            return <ViewIcon />
    }
}

const getOverlayText = (
    type: GalleryItemProps['overlayContent'],
    customText?: string,
) => {
    if (customText) return customText
    switch (type) {
        case 'view':
            return 'View'
        case 'zoom':
            return 'Zoom'
        case 'expand':
            return 'Expand'
        default:
            return 'View'
    }
}

/**
 * GalleryItem - An individual gallery image with optional hover overlay
 */
export const GalleryItem: FC<GalleryItemProps> = ({
    src,
    alt = 'Gallery image',
    href,
    showOverlay = false,
    overlayContent = 'view',
    overlayText,
    aspect = 'square',
    rounded = 'default',
    class: className,
    imageClass,
}) => {
    const imageClasses = cn(
        'w-full h-full object-cover bg-muted',
        roundedVariants[rounded],
        imageClass,
    )

    const containerClasses = cn(
        'group relative overflow-hidden',
        aspect !== 'auto' && aspectVariants[aspect],
        roundedVariants[rounded],
        className,
    )

    const content = (
        <>
            <img class={imageClasses} src={src} alt={alt} loading='lazy' />
            {showOverlay && overlayContent !== 'none' && (
                <div class='absolute bottom-1 end-1 opacity-0 group-hover:opacity-100 transition z-10'>
                    <div class='flex items-center gap-x-1 py-1 px-2 bg-background border border-border text-foreground rounded-lg'>
                        {getOverlayIcon(overlayContent)}
                        <span class='text-xs'>
                            {getOverlayText(overlayContent, overlayText)}
                        </span>
                    </div>
                </div>
            )}
        </>
    )

    if (href) {
        return (
            <a class={cn(containerClasses, 'block')} href={href}>
                {content}
            </a>
        )
    }

    return (
        <div class={containerClasses}>
            {content}
        </div>
    )
}

// ============================================================================
// Gallery Image (Simple image without overlay)
// ============================================================================

export interface GalleryImageProps {
    /** Image source URL */
    src: string
    /** Image alt text */
    alt?: string
    /** Image aspect ratio */
    aspect?: 'square' | 'video' | 'auto'
    /** Border radius */
    rounded?: 'none' | 'default' | 'sm' | 'md' | 'lg' | 'full'
    /** Additional class names */
    class?: string
}

/**
 * GalleryImage - A simple gallery image without overlay
 */
export const GalleryImage: FC<GalleryImageProps> = ({
    src,
    alt = 'Gallery image',
    aspect = 'square',
    rounded = 'default',
    class: className,
}) => {
    if (aspect === 'auto') {
        return (
            <img
                class={cn(
                    'w-full h-auto object-cover',
                    roundedVariants[rounded],
                    className,
                )}
                src={src}
                alt={alt}
                loading='lazy'
            />
        )
    }

    return (
        <div
            class={cn(
                'relative overflow-hidden',
                aspectVariants[aspect],
                roundedVariants[rounded],
                className,
            )}
        >
            <img
                class='absolute inset-0 w-full h-full object-cover'
                src={src}
                alt={alt}
                loading='lazy'
            />
        </div>
    )
}

// ============================================================================
// Gallery (Main container)
// ============================================================================

export interface GalleryProps {
    /** Gallery variant */
    variant?: 'grid' | 'masonry' | 'flow'
    /** Number of columns (for grid/masonry) */
    cols?: 2 | 3 | 4 | 5 | 6
    /** Row height (for flow variant) */
    rowHeight?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    /** Gap between items */
    gap?: 'none' | 'sm' | 'md' | 'lg'
    /** Additional class names */
    class?: string
}

/**
 * Gallery - Main gallery container
 */
export const Gallery: FC<PropsWithChildren<GalleryProps>> = ({
    variant = 'grid',
    cols = 3,
    rowHeight = 'md',
    gap = 'md',
    class: className,
    children,
}) => {
    if (variant === 'flow') {
        return (
            <GalleryJustified
                rowHeight={rowHeight}
                gap={gap}
                class={className}
            >
                {children}
            </GalleryJustified>
        )
    }

    if (variant === 'masonry') {
        return (
            <GalleryMasonry
                cols={cols as 2 | 3 | 4 | 5}
                gap={gap}
                class={className}
            >
                {children}
            </GalleryMasonry>
        )
    }

    return (
        <GalleryGrid cols={cols} gap={gap} class={className}>
            {children}
        </GalleryGrid>
    )
}

// ============================================================================
// Gallery with Lightbox Script
// ============================================================================

/**
 * GalleryLightboxScript - Script for lightbox functionality
 * Include once in your layout when using lightbox galleries
 */
export const GalleryLightboxScript: FC = () => {
    const script = `
(function() {
    function initGalleryLightbox() {
        const lightbox = document.createElement('div');
        lightbox.id = 'gallery-lightbox';
        lightbox.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/90 p-4';
        lightbox.innerHTML = \`
            <button class="absolute top-4 right-4 text-white hover:text-white/80 transition" onclick="closeLightbox()">
                <svg class="size-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
            <img id="lightbox-image" class="max-h-[90vh] max-w-[90vw] object-contain" src="" alt="Lightbox image"/>
        \`;
        document.body.appendChild(lightbox);

        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox) closeLightbox();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeLightbox();
        });
    }

    window.openLightbox = function(src) {
        const lightbox = document.getElementById('gallery-lightbox');
        const img = document.getElementById('lightbox-image');
        if (lightbox && img) {
            img.src = src;
            lightbox.classList.remove('hidden');
            lightbox.classList.add('flex');
        }
    };

    window.closeLightbox = function() {
        const lightbox = document.getElementById('gallery-lightbox');
        if (lightbox) {
            lightbox.classList.add('hidden');
            lightbox.classList.remove('flex');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGalleryLightbox);
    } else {
        initGalleryLightbox();
    }
})();
`
    return <script dangerouslySetInnerHTML={{ __html: script }} />
}

// ============================================================================
// Gallery Lightbox Item
// ============================================================================

export interface GalleryLightboxItemProps {
    /** Image source URL */
    src: string
    /** Full size image URL for lightbox (defaults to src) */
    fullSrc?: string
    /** Image alt text */
    alt?: string
    /** Image aspect ratio */
    aspect?: 'square' | 'video' | 'auto'
    /** Border radius */
    rounded?: 'none' | 'default' | 'sm' | 'md' | 'lg' | 'full'
    /** Additional class names */
    class?: string
}

/**
 * GalleryLightboxItem - Gallery item that opens in a lightbox
 */
export const GalleryLightboxItem: FC<GalleryLightboxItemProps> = ({
    src,
    fullSrc,
    alt = 'Gallery image',
    aspect = 'square',
    rounded = 'default',
    class: className,
}) => {
    const imageSrc = fullSrc || src

    return (
        <button
            type='button'
            class={cn(
                'group block relative overflow-hidden cursor-zoom-in',
                aspect !== 'auto' && aspectVariants[aspect],
                roundedVariants[rounded],
                className,
            )}
            onclick={`openLightbox('${imageSrc}')`}
        >
            <img
                class={cn(
                    'w-full h-full object-cover bg-muted transition-transform group-hover:scale-105',
                    roundedVariants[rounded],
                )}
                src={src}
                alt={alt}
                loading='lazy'
            />
            <div class='absolute bottom-1 end-1 opacity-0 group-hover:opacity-100 transition z-10'>
                <div class='flex items-center gap-x-1 py-1 px-2 bg-background border border-border text-foreground rounded-lg'>
                    <ExpandIcon />
                    <span class='text-xs'>Expand</span>
                </div>
            </div>
        </button>
    )
}
