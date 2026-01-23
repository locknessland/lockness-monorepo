/**
 * @fileoverview Live examples for Gallery component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import {
    GalleryGrid,
    GalleryImage,
    GalleryItem,
    GalleryJustified,
    GalleryJustifiedItem,
    GalleryLightboxItem,
    GalleryMasonry,
    GalleryMasonryColumn,
} from './mod.tsx'

export interface ExampleSection {
    title: string
    description?: string
    render: () => unknown
}

// Sample images for demos
const sampleImages = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=400&h=400&fit=crop',
]

const gridImages = [
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1434394354979-a235cd36269d?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=400&fit=crop',
]

const justifiedImages: Array<{
    src: string
    ratio: 'landscape' | 'portrait' | 'wide' | 'ultrawide' | 'square' | 'tall'
}> = [
    { src: gridImages[0], ratio: 'wide' },
    { src: gridImages[1], ratio: 'portrait' },
    { src: gridImages[2], ratio: 'landscape' },
    { src: gridImages[3], ratio: 'square' },
    { src: gridImages[4], ratio: 'ultrawide' },
    { src: gridImages[5], ratio: 'tall' },
    { src: gridImages[6], ratio: 'landscape' },
    { src: gridImages[7], ratio: 'wide' },
    { src: sampleImages[0], ratio: 'portrait' },
    { src: sampleImages[1], ratio: 'square' },
    { src: sampleImages[2], ratio: 'landscape' },
    { src: sampleImages[3], ratio: 'wide' },
]

const masonryImages = {
    col1: [sampleImages[0], sampleImages[1]],
    col2: [sampleImages[2], sampleImages[3], sampleImages[4]],
    col3: [sampleImages[5], sampleImages[0]],
    col4: [sampleImages[1], sampleImages[2], sampleImages[3]],
}

const galleryGridProps: PropDefinition[] = [
    {
        name: 'cols',
        type: '2 | 3 | 4 | 5 | 6',
        default: '3',
        description: 'Number of columns',
    },
    {
        name: 'gap',
        type: 'none | sm | md | lg',
        default: 'md',
        description: 'Gap between items',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const galleryJustifiedProps: PropDefinition[] = [
    {
        name: 'rowHeight',
        type: 'xs | sm | md | lg | xl',
        default: 'md',
        description: 'Height of each row in the gallery',
    },
    {
        name: 'gap',
        type: 'none | sm | md | lg',
        default: 'md',
        description: 'Gap between items',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const galleryImageProps: PropDefinition[] = [
    {
        name: 'src',
        type: 'string',
        required: true,
        description: 'Image source URL',
    },
    { name: 'alt', type: 'string', description: 'Image alt text' },
    {
        name: 'aspect',
        type: 'square | video | portrait | auto',
        default: 'auto',
        description: 'Aspect ratio',
    },
    {
        name: 'rounded',
        type: 'none | default | sm | md | lg | full',
        default: 'default',
        description: 'Border radius',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

export const examples: ExampleSection[] = [
    {
        title: 'View Button on Hover',
        description: 'Gallery items with hover overlay showing a view button.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={3} gap='md'>
                            {sampleImages.map((src, i) => (
                                <GalleryItem
                                    key={i}
                                    src={src}
                                    href='#'
                                    showOverlay
                                    overlayContent='view'
                                    alt={`Project ${i + 1}`}
                                />
                            ))}
                        </GalleryGrid>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { GalleryGrid, GalleryItem } from '@lockness/ui/components'

<GalleryGrid cols={3} gap="md">
  <GalleryItem
    src="/image1.jpg"
    href="/project/1"
    showOverlay
    overlayContent="view"
    alt="Project 1"
  />
  <GalleryItem
    src="/image2.jpg"
    href="/project/2"
    showOverlay
    overlayContent="view"
    alt="Project 2"
  />
  {/* ... more items */}
</GalleryGrid>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Overlay Variants',
        description: 'Different overlay icons and text options.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={4} gap='md'>
                            <GalleryItem
                                src={sampleImages[0]}
                                href='#'
                                showOverlay
                                overlayContent='view'
                            />
                            <GalleryItem
                                src={sampleImages[1]}
                                href='#'
                                showOverlay
                                overlayContent='zoom'
                            />
                            <GalleryItem
                                src={sampleImages[2]}
                                href='#'
                                showOverlay
                                overlayContent='expand'
                            />
                            <GalleryItem
                                src={sampleImages[3]}
                                href='#'
                                showOverlay
                                overlayContent='view'
                                overlayText='Open'
                            />
                        </GalleryGrid>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GalleryItem showOverlay overlayContent="view" />
<GalleryItem showOverlay overlayContent="zoom" />
<GalleryItem showOverlay overlayContent="expand" />
<GalleryItem showOverlay overlayContent="view" overlayText="Open" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Squared Grid - 4 Columns',
        description: 'Simple squared image grid without overlays.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={4} gap='md'>
                            {gridImages.map((src, i) => (
                                <GalleryImage
                                    key={i}
                                    src={src}
                                    aspect='square'
                                    alt={`Image ${i + 1}`}
                                />
                            ))}
                        </GalleryGrid>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { GalleryGrid, GalleryImage } from '@lockness/ui/components'

<GalleryGrid cols={4} gap="md">
  <GalleryImage src="/image1.jpg" aspect="square" />
  <GalleryImage src="/image2.jpg" aspect="square" />
  <GalleryImage src="/image3.jpg" aspect="square" />
  {/* ... more images */}
</GalleryGrid>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Masonry Layout - 4 Columns',
        description: 'Masonry-style layout with variable height images.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryMasonry cols={4} gap='md'>
                            <GalleryMasonryColumn>
                                {masonryImages.col1.map((src, i) => (
                                    <GalleryImage
                                        key={i}
                                        src={src}
                                        aspect='auto'
                                    />
                                ))}
                            </GalleryMasonryColumn>
                            <GalleryMasonryColumn>
                                {masonryImages.col2.map((src, i) => (
                                    <GalleryImage
                                        key={i}
                                        src={src}
                                        aspect='auto'
                                    />
                                ))}
                            </GalleryMasonryColumn>
                            <GalleryMasonryColumn>
                                {masonryImages.col3.map((src, i) => (
                                    <GalleryImage
                                        key={i}
                                        src={src}
                                        aspect='auto'
                                    />
                                ))}
                            </GalleryMasonryColumn>
                            <GalleryMasonryColumn>
                                {masonryImages.col4.map((src, i) => (
                                    <GalleryImage
                                        key={i}
                                        src={src}
                                        aspect='auto'
                                    />
                                ))}
                            </GalleryMasonryColumn>
                        </GalleryMasonry>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import {
  GalleryMasonry,
  GalleryMasonryColumn,
  GalleryImage
} from '@lockness/ui/components'

<GalleryMasonry cols={4} gap="md">
  <GalleryMasonryColumn>
    <GalleryImage src="/image1.jpg" aspect="auto" />
    <GalleryImage src="/image2.jpg" aspect="auto" />
    <GalleryImage src="/image3.jpg" aspect="auto" />
  </GalleryMasonryColumn>
  <GalleryMasonryColumn>
    <GalleryImage src="/image4.jpg" aspect="auto" />
    <GalleryImage src="/image5.jpg" aspect="auto" />
  </GalleryMasonryColumn>
  {/* ... more columns */}
</GalleryMasonry>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Justified Layout',
        description:
            'Justified gallery layout (like Flickr/Google Photos). Images with variable aspect ratios stretch to fill each row completely.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryJustified rowHeight='lg' gap='md'>
                            {justifiedImages.map((img, i) => (
                                <GalleryJustifiedItem
                                    key={i}
                                    src={img.src}
                                    ratio={img.ratio}
                                    alt={`Justified image ${i + 1}`}
                                />
                            ))}
                        </GalleryJustified>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { GalleryJustified, GalleryJustifiedItem } from '@lockness/ui/components'

<GalleryJustified rowHeight="lg" gap="md">
  <GalleryJustifiedItem src="/photo1.jpg" ratio="wide" />
  <GalleryJustifiedItem src="/photo2.jpg" ratio="portrait" />
  <GalleryJustifiedItem src="/photo3.jpg" ratio="landscape" />
  <GalleryJustifiedItem src="/photo4.jpg" ratio="square" />
  <GalleryJustifiedItem src="/photo5.jpg" ratio="ultrawide" />
  <GalleryJustifiedItem src="/photo6.jpg" ratio="tall" />
  {/* Images fill each row and wrap naturally */}
</GalleryJustified>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Justified Row Height Variants',
        description:
            'Control the height of each row. Width adapts based on aspect ratio.',
        render: () => (
            <div class='space-y-4'>
                <h3 class='font-medium text-foreground'>
                    Extra Small (xs) - 80px
                </h3>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryJustified rowHeight='xs' gap='sm'>
                            {justifiedImages.map((img, i) => (
                                <GalleryJustifiedItem
                                    key={i}
                                    src={img.src}
                                    ratio={img.ratio}
                                />
                            ))}
                        </GalleryJustified>
                    </CardContent>
                </Card>

                <h3 class='font-medium text-foreground mt-6'>
                    Medium (md) - 144px
                </h3>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryJustified rowHeight='md' gap='md'>
                            {justifiedImages.slice(0, 8).map((img, i) => (
                                <GalleryJustifiedItem
                                    key={i}
                                    src={img.src}
                                    ratio={img.ratio}
                                />
                            ))}
                        </GalleryJustified>
                    </CardContent>
                </Card>

                <CodeBlock lang='tsx'>
                    {`<GalleryJustified rowHeight="xs" />  {/* 80px row height */}
<GalleryJustified rowHeight="sm" />  {/* 112px row height */}
<GalleryJustified rowHeight="md" />  {/* 144px row height (default) */}
<GalleryJustified rowHeight="lg" />  {/* 192px row height */}
<GalleryJustified rowHeight="xl" />  {/* 256px row height */}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Justified Aspect Ratios',
        description: 'Available aspect ratios for GalleryJustifiedItem.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryJustified rowHeight='md' gap='md'>
                            <GalleryJustifiedItem
                                src={gridImages[0]}
                                ratio='tall'
                            />
                            <GalleryJustifiedItem
                                src={gridImages[1]}
                                ratio='portrait'
                            />
                            <GalleryJustifiedItem
                                src={gridImages[2]}
                                ratio='square'
                            />
                            <GalleryJustifiedItem
                                src={gridImages[3]}
                                ratio='landscape'
                            />
                            <GalleryJustifiedItem
                                src={gridImages[4]}
                                ratio='wide'
                            />
                            <GalleryJustifiedItem
                                src={gridImages[5]}
                                ratio='ultrawide'
                            />
                        </GalleryJustified>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Available ratios:
<GalleryJustifiedItem ratio="tall" />       {/* 2:3 - Vertical */}
<GalleryJustifiedItem ratio="portrait" />   {/* 3:4 - Portrait */}
<GalleryJustifiedItem ratio="square" />     {/* 1:1 - Square */}
<GalleryJustifiedItem ratio="landscape" />  {/* 4:3 - Landscape (default) */}
<GalleryJustifiedItem ratio="wide" />       {/* 16:9 - Wide */}
<GalleryJustifiedItem ratio="ultrawide" />  {/* 21:9 - Ultrawide */}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Lightbox Gallery',
        description: 'Click images to open in a full-screen lightbox.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={3} gap='md'>
                            {sampleImages.map((src, i) => (
                                <GalleryLightboxItem
                                    key={i}
                                    src={src}
                                    alt={`Lightbox image ${i + 1}`}
                                />
                            ))}
                        </GalleryGrid>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import {
  GalleryGrid,
  GalleryLightboxItem,
  GalleryLightboxScript
} from '@lockness/ui/components'

// Add the script once in your layout
<GalleryLightboxScript />

// Then use GalleryLightboxItem
<GalleryGrid cols={3} gap="md">
  <GalleryLightboxItem src="/thumb1.jpg" fullSrc="/full1.jpg" />
  <GalleryLightboxItem src="/thumb2.jpg" fullSrc="/full2.jpg" />
  <GalleryLightboxItem src="/thumb3.jpg" fullSrc="/full3.jpg" />
</GalleryGrid>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Column Variants',
        render: () => (
            <div class='space-y-4'>
                <h3 class='font-medium text-foreground'>2 Columns</h3>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={2} gap='md'>
                            {sampleImages.slice(0, 4).map((src, i) => (
                                <GalleryImage key={i} src={src} />
                            ))}
                        </GalleryGrid>
                    </CardContent>
                </Card>

                <h3 class='font-medium text-foreground mt-6'>5 Columns</h3>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={5} gap='md'>
                            {sampleImages.slice(0, 5).map((src, i) => (
                                <GalleryImage key={i} src={src} />
                            ))}
                        </GalleryGrid>
                    </CardContent>
                </Card>

                <CodeBlock lang='tsx'>
                    {`<GalleryGrid cols={2}>...</GalleryGrid>
<GalleryGrid cols={3}>...</GalleryGrid>
<GalleryGrid cols={4}>...</GalleryGrid>
<GalleryGrid cols={5}>...</GalleryGrid>
<GalleryGrid cols={6}>...</GalleryGrid>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Gap Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <div>
                            <p class='text-sm text-muted-foreground mb-2'>
                                gap="none"
                            </p>
                            <GalleryGrid cols={4} gap='none'>
                                {sampleImages.slice(0, 4).map((src, i) => (
                                    <GalleryImage
                                        key={i}
                                        src={src}
                                        rounded='none'
                                    />
                                ))}
                            </GalleryGrid>
                        </div>
                        <div>
                            <p class='text-sm text-muted-foreground mb-2'>
                                gap="sm"
                            </p>
                            <GalleryGrid cols={4} gap='sm'>
                                {sampleImages.slice(0, 4).map((src, i) => (
                                    <GalleryImage key={i} src={src} />
                                ))}
                            </GalleryGrid>
                        </div>
                        <div>
                            <p class='text-sm text-muted-foreground mb-2'>
                                gap="lg"
                            </p>
                            <GalleryGrid cols={4} gap='lg'>
                                {sampleImages.slice(0, 4).map((src, i) => (
                                    <GalleryImage key={i} src={src} />
                                ))}
                            </GalleryGrid>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GalleryGrid gap="none">...</GalleryGrid>
<GalleryGrid gap="sm">...</GalleryGrid>
<GalleryGrid gap="md">...</GalleryGrid>  {/* default */}
<GalleryGrid gap="lg">...</GalleryGrid>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Rounded Variants',
        description:
            'Use rounded="default" to follow the global --radius CSS variable.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <GalleryGrid cols={6} gap='md'>
                            <GalleryImage
                                src={sampleImages[0]}
                                rounded='none'
                            />
                            <GalleryImage
                                src={sampleImages[1]}
                                rounded='default'
                            />
                            <GalleryImage src={sampleImages[2]} rounded='sm' />
                            <GalleryImage src={sampleImages[3]} rounded='md' />
                            <GalleryImage src={sampleImages[4]} rounded='lg' />
                            <GalleryImage
                                src={sampleImages[5]}
                                rounded='full'
                            />
                        </GalleryGrid>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GalleryImage rounded="none" />
<GalleryImage rounded="default" />  {/* uses --radius variable */}
<GalleryImage rounded="sm" />
<GalleryImage rounded="md" />
<GalleryImage rounded="lg" />
<GalleryImage rounded="full" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable title='GalleryGrid' props={galleryGridProps} />
                <PropsTable
                    title='GalleryJustified'
                    props={galleryJustifiedProps}
                />
                <PropsTable title='GalleryImage' props={galleryImageProps} />
            </div>
        ),
    },
]
