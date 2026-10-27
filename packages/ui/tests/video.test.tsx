import { assertStringIncludes } from '@std/assert'
import { Video } from '../components/Video/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Video component', async (t) => {
    await t.step('renders with basic src prop', () => {
        const html = renderToString(<Video src='/videos/demo.mp4' />)
        assertStringIncludes(html, '<video')
        assertStringIncludes(html, '/videos/demo.mp4')
        assertStringIncludes(html, 'controls')
    })

    await t.step('renders without controls when controls=false', () => {
        const html = renderToString(
            <Video src='/videos/demo.mp4' controls={false} />,
        )
        assertStringIncludes(html, '<video')
        assertStringIncludes(html, '/videos/demo.mp4')
    })

    await t.step('renders with poster image', () => {
        const html = renderToString(
            <Video src='/videos/demo.mp4' poster='/img/poster.jpg' />,
        )
        assertStringIncludes(html, 'poster="/img/poster.jpg"')
    })

    await t.step('renders with multiple sources', () => {
        const html = renderToString(
            <Video
                sources={[
                    { src: '/videos/demo.webm', type: 'video/webm' },
                    { src: '/videos/demo.mp4', type: 'video/mp4' },
                ]}
            />,
        )
        assertStringIncludes(html, '/videos/demo.webm')
        assertStringIncludes(html, 'video/webm')
        assertStringIncludes(html, '/videos/demo.mp4')
        assertStringIncludes(html, 'video/mp4')
    })

    await t.step('renders with autoplay, muted, and loop', () => {
        const html = renderToString(
            <Video src='/videos/bg.mp4' autoplay muted loop />,
        )
        assertStringIncludes(html, 'autoplay')
        assertStringIncludes(html, 'muted')
        assertStringIncludes(html, 'loop')
    })

    await t.step('renders with playsinline attribute', () => {
        const html = renderToString(
            <Video src='/videos/demo.mp4' playsinline />,
        )
        assertStringIncludes(html, 'playsinline')
    })

    await t.step('renders with preload attribute', () => {
        const html = renderToString(
            <Video src='/videos/demo.mp4' preload='auto' />,
        )
        assertStringIncludes(html, 'preload="auto"')
    })

    await t.step('applies aspect ratio classes', () => {
        const html16by9 = renderToString(
            <Video src='/videos/demo.mp4' aspectRatio='16/9' />,
        )
        assertStringIncludes(html16by9, 'aspect-video')

        const html4by3 = renderToString(
            <Video src='/videos/demo.mp4' aspectRatio='4/3' />,
        )
        assertStringIncludes(html4by3, 'aspect-[4/3]')

        const htmlSquare = renderToString(
            <Video src='/videos/demo.mp4' aspectRatio='1/1' />,
        )
        assertStringIncludes(htmlSquare, 'aspect-square')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(
            <Video
                src='/videos/demo.mp4'
                class='rounded-lg shadow-lg'
            />,
        )
        assertStringIncludes(html, 'rounded-lg')
        assertStringIncludes(html, 'shadow-lg')
    })

    await t.step('renders with width and height attributes', () => {
        const html = renderToString(
            <Video src='/videos/demo.mp4' width={640} height={360} />,
        )
        assertStringIncludes(html, 'width="640"')
        assertStringIncludes(html, 'height="360"')
    })

    await t.step('renders with aria-label for accessibility', () => {
        const html = renderToString(
            <Video
                src='/videos/tutorial.mp4'
                aria-label='Product tutorial video'
            />,
        )
        assertStringIncludes(html, 'aria-label="Product tutorial video"')
    })

    await t.step('renders default fallback content', () => {
        const html = renderToString(<Video src='/videos/demo.mp4' />)
        assertStringIncludes(
            html,
            'Your browser does not support the video tag.',
        )
    })

    await t.step('renders custom fallback content', () => {
        const html = renderToString(
            <Video src='/videos/demo.mp4'>
                <p>Custom fallback message</p>
            </Video>,
        )
        assertStringIncludes(html, 'Custom fallback message')
    })

    await t.step('applies default bg-black and w-full classes', () => {
        const html = renderToString(<Video src='/videos/demo.mp4' />)
        assertStringIncludes(html, 'bg-black')
        assertStringIncludes(html, 'w-full')
    })
})
