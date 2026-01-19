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
    variant?: 'grid' | 'masonry'
    /** Number of columns */
    cols?: 2 | 3 | 4 | 5 | 6
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
    gap = 'md',
    class: className,
    children,
}) => {
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
