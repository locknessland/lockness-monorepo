/**
 * @fileoverview Video component for displaying video content.
 *
 * Provides a styled, accessible video player with support for
 * multiple sources, controls, and responsive layouts.
 *
 * @module @lockness/ui/components/video
 */

import type { FC, PropsWithChildren } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

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
