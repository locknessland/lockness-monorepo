# Video

A responsive video player component with support for multiple sources, controls,
and aspect ratios.

## Installation

```bash
deno run -A jsr:@lockness/ui add video
```

## Usage

```tsx
import { Video } from '@lockness/ui/components'

// Basic usage
<Video src="/videos/demo.mp4" controls />

// With poster image
<Video
    src="/videos/demo.mp4"
    poster="/img/poster.jpg"
    controls
/>

// Multiple sources with fallback
<Video
    sources={[
        { src: '/videos/demo.webm', type: 'video/webm' },
        { src: '/videos/demo.mp4', type: 'video/mp4' },
    ]}
    poster="/img/poster.jpg"
    controls
    aspectRatio="16/9"
/>

// Background video (autoplay)
<Video
    src="/videos/background.mp4"
    autoplay
    muted
    loop
    aspectRatio="21/9"
/>
```

## Props

| Prop        | Type                                           | Default      | Description                                       |
| ----------- | ---------------------------------------------- | ------------ | ------------------------------------------------- |
| src         | `string`                                       | -            | Single video source URL                           |
| sources     | `VideoSource[]`                                | -            | Multiple video sources for format fallback        |
| poster      | `string`                                       | -            | Poster image URL shown before playback            |
| controls    | `boolean`                                      | `true`       | Show video controls                               |
| autoplay    | `boolean`                                      | `false`      | Autoplay video (requires muted for browsers)      |
| muted       | `boolean`                                      | `false`      | Mute video audio                                  |
| loop        | `boolean`                                      | `false`      | Loop video playback                               |
| playsinline | `boolean`                                      | `true`       | Play video inline on mobile (prevents fullscreen) |
| preload     | `'none' \| 'metadata' \| 'auto'`               | `'metadata'` | Preload behavior                                  |
| aspectRatio | `'16/9' \| '4/3' \| '1/1' \| '21/9' \| string` | -            | Responsive aspect ratio                           |
| width       | `number \| string`                             | -            | Video width                                       |
| height      | `number \| string`                             | -            | Video height                                      |
| class       | `string`                                       | -            | Additional CSS classes                            |
| aria-label  | `string`                                       | -            | Accessible label for the video                    |

### VideoSource Interface

| Property | Type     | Description                                 |
| -------- | -------- | ------------------------------------------- |
| src      | `string` | Video file URL                              |
| type     | `string` | MIME type (e.g., 'video/mp4', 'video/webm') |

## Features

### Multiple Format Support

Provide multiple video formats for browser compatibility:

```tsx
<Video
    sources={[
        { src: '/video.webm', type: 'video/webm' },
        { src: '/video.mp4', type: 'video/mp4' },
        { src: '/video.ogv', type: 'video/ogg' },
    ]}
    controls
/>
```

### Aspect Ratios

Use predefined aspect ratios for responsive video containers:

```tsx
// Standard widescreen (16:9)
<Video src="/video.mp4" aspectRatio="16/9" />

// Classic TV ratio (4:3)
<Video src="/video.mp4" aspectRatio="4/3" />

// Square (1:1)
<Video src="/video.mp4" aspectRatio="1/1" />

// Ultrawide (21:9)
<Video src="/video.mp4" aspectRatio="21/9" />

// Custom aspect ratio
<Video src="/video.mp4" aspectRatio="2/1" />
```

### Background Videos

For hero sections or decorative backgrounds:

```tsx
<Video
    src='/background.mp4'
    autoplay
    muted
    loop
    playsinline
    aspectRatio='21/9'
/>
```

**Note:** Most browsers require `muted` for autoplay to work.

### Accessibility

Always provide meaningful labels for screen readers:

```tsx
<Video
    src='/tutorial.mp4'
    controls
    aria-label='Product tutorial video'
/>
```

### Custom Fallback Content

Provide custom fallback for browsers that don't support video:

```tsx
<Video src='/demo.mp4' controls>
    <p>
        Your browser does not support video playback.
        <a href='/demo.mp4'>Download the video</a> instead.
    </p>
</Video>
```

## Best Practices

1. **Provide multiple formats**: WebM for smaller file sizes, MP4 for
   compatibility
2. **Use poster images**: Improves perceived performance and provides preview
3. **Add `playsinline` for mobile**: Prevents fullscreen on iOS Safari
4. **Mute autoplay videos**: Required by most browsers' autoplay policies
5. **Set appropriate preload**: Use `metadata` for faster page loads, `auto` for
   critical videos
6. **Include accessibility labels**: Use `aria-label` for screen readers
7. **Optimize file sizes**: Compress videos and use appropriate bitrates

## Browser Support

The Video component uses native HTML5 `<video>` element, which is supported by
all modern browsers:

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires `playsinline` for inline mobile playback)
- iOS Safari: Requires `muted` for autoplay

## Examples

See the [Video component page](/ui/video) for live examples and interactive
demos.
