/**
 * @fileoverview Video component examples for documentation.
 *
 * @module @lockness/ui/components/video/examples
 */

import { Card, CardContent, CodeBlock } from '@lockness/ui/components'
import { Video } from './mod.tsx'
import type { ExampleSection } from '../../doc_loader.ts'
import { createDocsSection } from '../../docs_renderer.tsx'

/**
 * Basic usage example
 */
const BasicExample = () => (
    <div class='space-y-4'>
        <Card>
            <CardContent class='p-6'>
                <Video
                    src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                    controls
                    class='rounded-lg'
                />
            </CardContent>
        </Card>
        <CodeBlock lang='tsx'>
            {`<Video
    src="/videos/demo.mp4"
    controls
    class="rounded-lg"
/>`}
        </CodeBlock>
    </div>
)

/**
 * With poster image
 */
const WithPosterExample = () => (
    <div class='space-y-4'>
        <Card>
            <CardContent class='p-6'>
                <Video
                    src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                    poster='https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop'
                    controls
                    class='rounded-lg'
                />
            </CardContent>
        </Card>
        <CodeBlock lang='tsx'>
            {`<Video
    src="/videos/demo.mp4"
    poster="/img/poster.jpg"
    controls
    class="rounded-lg"
/>`}
        </CodeBlock>
    </div>
)

/**
 * Multiple sources with aspect ratio
 */
const MultipleSourcesExample = () => (
    <div class='space-y-4'>
        <Card>
            <CardContent class='p-6'>
                <Video
                    sources={[
                        {
                            src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                            type: 'video/mp4',
                        },
                    ]}
                    poster='https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&auto=format&fit=crop'
                    controls
                    aspectRatio='16/9'
                    class='rounded-lg shadow-lg'
                />
            </CardContent>
        </Card>
        <CodeBlock lang='tsx'>
            {`<Video
    sources={[
        { src: '/videos/demo.webm', type: 'video/webm' },
        { src: '/videos/demo.mp4', type: 'video/mp4' },
    ]}
    poster="/img/poster.jpg"
    controls
    aspectRatio="16/9"
    class="rounded-lg shadow-lg"
/>`}
        </CodeBlock>
    </div>
)

/**
 * Autoplay muted loop (background video)
 */
const BackgroundVideoExample = () => (
    <div class='space-y-4'>
        <Card>
            <CardContent class='p-6'>
                <Video
                    src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                    autoplay
                    muted
                    loop
                    aspectRatio='21/9'
                    class='rounded-lg'
                />
            </CardContent>
        </Card>
        <CodeBlock lang='tsx'>
            {`<Video
    src="/videos/background.mp4"
    autoplay
    muted
    loop
    aspectRatio="21/9"
    class="rounded-lg"
/>`}
        </CodeBlock>
    </div>
)

/**
 * Different aspect ratios
 */
const AspectRatiosExample = () => (
    <div class='space-y-4'>
        <Card>
            <CardContent class='p-6 space-y-6'>
                <div class='space-y-2'>
                    <h3 class='text-sm font-semibold'>16:9 (Standard)</h3>
                    <Video
                        src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                        controls
                        aspectRatio='16/9'
                        class='rounded-lg'
                    />
                </div>
                <div class='space-y-2'>
                    <h3 class='text-sm font-semibold'>4:3 (Classic)</h3>
                    <Video
                        src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                        controls
                        aspectRatio='4/3'
                        class='rounded-lg'
                    />
                </div>
                <div class='space-y-2'>
                    <h3 class='text-sm font-semibold'>1:1 (Square)</h3>
                    <Video
                        src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                        controls
                        aspectRatio='1/1'
                        class='rounded-lg'
                    />
                </div>
            </CardContent>
        </Card>
        <CodeBlock lang='tsx'>
            {`// Standard widescreen
<Video src="/video.mp4" aspectRatio="16/9" controls />

// Classic TV ratio
<Video src="/video.mp4" aspectRatio="4/3" controls />

// Square for social media
<Video src="/video.mp4" aspectRatio="1/1" controls />`}
        </CodeBlock>
    </div>
)

/**
 * Exported examples array for documentation
 */
export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Video'),
    {
        title: 'Basic Usage',
        render: BasicExample,
    },
    {
        title: 'With Poster Image',
        render: WithPosterExample,
    },
    {
        title: 'Multiple Sources',
        render: MultipleSourcesExample,
    },
    {
        title: 'Background Video (Autoplay)',
        render: BackgroundVideoExample,
    },
    {
        title: 'Different Aspect Ratios',
        render: AspectRatiosExample,
    },
]
