import {
    Card,
    CardContent,
    CodeBlock,
    GalleryJustified,
    GalleryJustifiedItem,
    GalleryGrid,
    GalleryImage,
    GalleryItem,
    GalleryLightboxItem,
    GalleryMasonry,
    GalleryMasonryColumn,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

// Sample images for demos
const sampleImages = [
    'https://images.unsplash.com/photo-1656618724305-a4257e46e847?q=80&w=320&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1616427592793-67b858804534?q=80&w=320&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1516131206008-dd041a9764fd?q=80&w=320&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1707760696486-2a2cd7e0b6a6?q=80&w=320&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1585159812596-fac104f2f069?q=80&w=320&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1654131300276-db70adf4f85d?q=80&w=320&auto=format&fit=crop',
]

const masonryImages = {
    col1: [
        'https://images.unsplash.com/photo-1540575861501-7cf05a4b125a?w=560&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1668906093328-99601a1aa584?w=560&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1567016526105-22da7c13161a?w=560&auto=format&fit=crop',
    ],
    col2: [
        'https://images.unsplash.com/photo-1668584054131-d5721c515211?w=560&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1664574654529-b60630f33fdb?w=560&auto=format&fit=crop',
    ],
    col3: [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=560&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1586232702178-f044c5f4d4b7?w=560&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1542125387-c71274d94f0a?w=560&auto=format&fit=crop',
    ],
    col4: [
        'https://images.unsplash.com/photo-1668869713519-9bcbb0da7171?w=560&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1668584054035-f5ba7d426401?w=560&auto=format&fit=crop',
    ],
}

const gridImages = [
    'https://images.unsplash.com/photo-1540575861501-7cf05a4b125a?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1668906093328-99601a1aa584?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1567016526105-22da7c13161a?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1668584054131-d5721c515211?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1664574654529-b60630f33fdb?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1669824774762-65ddf29bee56?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1586232702178-f044c5f4d4b7?w=560&auto=format&fit=crop',
]

// Flow images with their ratios
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

export const GalleryPage = () => {
    return (
        <PageUiLayout title='Gallery - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        GALLERY
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Responsive image galleries with grid, masonry layouts,
                        and hover overlays.
                    </p>
                </header>

                {/* View on Hover */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        VIEW BUTTON ON HOVER
                    </h2>
                    <p class='text-muted-foreground'>
                        Gallery items with hover overlay showing a view button.
                    </p>
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
                </section>

                {/* Overlay Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        OVERLAY VARIANTS
                    </h2>
                    <p class='text-muted-foreground'>
                        Different overlay icons and text options.
                    </p>
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
                </section>

                {/* Squared Grid 4 Cols */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SQUARED GRID - 4 COLUMNS
                    </h2>
                    <p class='text-muted-foreground'>
                        Simple squared image grid without overlays.
                    </p>
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
                </section>

                {/* Masonry Layout */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        MASONRY LAYOUT - 4 COLUMNS
                    </h2>
                    <p class='text-muted-foreground'>
                        Masonry-style layout with variable height images.
                    </p>
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
                </section>

                {/* Justified Layout */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        JUSTIFIED LAYOUT
                    </h2>
                    <p class='text-muted-foreground'>
                        Justified gallery layout (like Flickr/Google Photos). Images with
                        variable aspect ratios stretch to fill each row completely, then
                        wrap to the next line. Each image grows proportionally based on
                        its ratio.
                    </p>
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
                </section>

                {/* Justified Row Height Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        JUSTIFIED ROW HEIGHT VARIANTS
                    </h2>
                    <p class='text-muted-foreground'>
                        Control the height of each row. Width adapts based on
                        aspect ratio.
                    </p>

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

                    <h3 class='font-medium text-foreground mt-6'>
                        Extra Large (xl) - 256px
                    </h3>
                    <Card>
                        <CardContent class='p-6'>
                            <GalleryJustified rowHeight='xl' gap='lg'>
                                {justifiedImages.slice(0, 4).map((img, i) => (
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
                </section>

                {/* Justified Aspect Ratios */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        JUSTIFIED ASPECT RATIOS
                    </h2>
                    <p class='text-muted-foreground'>
                        Available aspect ratios for GalleryJustifiedItem.
                    </p>
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
                </section>

                {/* Lightbox Gallery */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        LIGHTBOX GALLERY
                    </h2>
                    <p class='text-muted-foreground'>
                        Click images to open in a full-screen lightbox.
                    </p>
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
                </section>

                {/* Column Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COLUMN VARIANTS
                    </h2>

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
                </section>

                {/* Gap Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        GAP VARIANTS
                    </h2>
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
                </section>

                {/* Rounded Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        ROUNDED VARIANTS
                    </h2>
                    <p class='text-muted-foreground'>
                        Use <code>rounded="default"</code> to follow the global
                        {' '}
                        <code>--radius</code> CSS variable.
                    </p>
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
                                <GalleryImage
                                    src={sampleImages[2]}
                                    rounded='sm'
                                />
                                <GalleryImage
                                    src={sampleImages[3]}
                                    rounded='md'
                                />
                                <GalleryImage
                                    src={sampleImages[4]}
                                    rounded='lg'
                                />
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
                </section>

                {/* Using Gallery Shorthand */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        GALLERY SHORTHAND
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the Gallery component as a shorthand for common
                        patterns.
                    </p>
                    <CodeBlock lang='tsx'>
                        {`import { Gallery, GalleryItem } from '@lockness/ui/components'

// Grid layout (default)
<Gallery variant="grid" cols={3} gap="md">
  <GalleryItem src="/image.jpg" showOverlay />
</Gallery>

// Masonry layout
<Gallery variant="masonry" cols={4} gap="md">
  {/* Use GalleryMasonryColumn children */}
</Gallery>`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>

                    <h3 class='font-medium text-foreground'>GalleryGrid</h3>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left p-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Default
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                cols
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                2 | 3 | 4 | 5 | 6
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                3
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                gap
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'none' | 'sm' | 'md' | 'lg'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'md'
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>
                        GalleryItem
                    </h3>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left p-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Default
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                src
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                required
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                href
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                showOverlay
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                boolean
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                false
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                overlayContent
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'view' | 'zoom' | 'expand' |
                                                'none'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'view'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                aspect
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'square' | 'video' | 'auto'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'square'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                size
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'sm' | 'md' | 'lg' | 'xl' |
                                                'full'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'md'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                rounded
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'none' | 'sm' | 'md' | 'lg' |
                                                'full'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'lg'
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
