# Gallery

Documentation for the Gallery component.

## Installation

```bash
deno run -A jsr:@lockness/ui add gallery
```

## Usage

```tsx
import { GalleryGrid, GalleryItem } from '@lockness/ui/components'

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
</GalleryGrid>
```

## Props

### GalleryGrid

| Prop  | Type                             | Default | Description            |
| ----- | -------------------------------- | ------- | ---------------------- |
| cols  | `2 \| 3 \| 4 \| 5 \| 6`          | `3`     | Number of columns      |
| gap   | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'`  | Gap between items      |
| class | `string`                         | -       | Additional class names |

### GalleryJustified

| Prop      | Type                                   | Default | Description                                                          |
| --------- | -------------------------------------- | ------- | -------------------------------------------------------------------- |
| rowHeight | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'`  | Height of each row (xs=80px, sm=112px, md=144px, lg=192px, xl=256px) |
| gap       | `'none' \| 'sm' \| 'md' \| 'lg'`       | `'md'`  | Gap between items                                                    |
| class     | `string`                               | -       | Additional CSS class names                                           |

### GalleryJustifiedItem

| Prop    | Type                                                                       | Default           | Description                          |
| ------- | -------------------------------------------------------------------------- | ----------------- | ------------------------------------ |
| src     | `string`                                                                   | **required**      | Image source URL                     |
| alt     | `string`                                                                   | `'Gallery image'` | Alternative text for the image       |
| ratio   | `'tall' \| 'portrait' \| 'square' \| 'landscape' \| 'wide' \| 'ultrawide'` | `'landscape'`     | Aspect ratio of the image container  |
| rounded | `'none' \| 'default' \| 'sm' \| 'md' \| 'lg'`                              | `'default'`       | Border radius of the image container |
| class   | `string`                                                                   | -                 | Additional CSS class names           |

### GalleryMasonry

| Prop  | Type                             | Default | Description            |
| ----- | -------------------------------- | ------- | ---------------------- |
| cols  | `2 \| 3 \| 4 \| 5`               | `4`     | Number of columns      |
| gap   | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'`  | Gap between items      |
| class | `string`                         | -       | Additional class names |

### GalleryMasonryColumn

| Prop  | Type                             | Default | Description                     |
| ----- | -------------------------------- | ------- | ------------------------------- |
| gap   | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'`  | Gap between items in the column |
| class | `string`                         | -       | Additional class names          |

### GalleryItem

| Prop           | Type                                                    | Default           | Description                  |
| -------------- | ------------------------------------------------------- | ----------------- | ---------------------------- |
| src            | `string`                                                | **required**      | Image source URL             |
| alt            | `string`                                                | `'Gallery image'` | Image alt text               |
| href           | `string`                                                | -                 | Link URL when clicked        |
| showOverlay    | `boolean`                                               | `false`           | Show hover overlay           |
| overlayContent | `'view' \| 'zoom' \| 'expand' \| 'none'`                | `'view'`          | Custom overlay content       |
| overlayText    | `string`                                                | -                 | Custom overlay text          |
| aspect         | `'square' \| 'video' \| 'auto'`                         | `'square'`        | Image aspect ratio           |
| rounded        | `'none' \| 'default' \| 'sm' \| 'md' \| 'lg' \| 'full'` | `'default'`       | Border radius                |
| class          | `string`                                                | -                 | Additional class names       |
| imageClass     | `string`                                                | -                 | Additional image class names |

## Examples

### Basic Example

```tsx
// Add example here
```
