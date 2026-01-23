# UploadZone

Documentation for the UploadZone component.

## Installation

```bash
deno run -A jsr:@lockness/ui add uploadzone
```

## Usage

```tsx
import { UploadZone } from '@lockness/ui/components'

<UploadZone
    text='Drag and drop your files here or'
    browseText='browse'
    helperText='PNG, JPG, GIF up to 10MB'
/>
```

## Props

### UploadZone

| Prop       | Type          | Default                    | Description                             |
| ---------- | ------------- | -------------------------- | --------------------------------------- |
| text       | `string`      | `'Drop your file here or'` | Main text to display                    |
| browseText | `string`      | `'browse'`                 | Browse link text                        |
| helperText | `string`      | `'Pick a file up to 2MB.'` | Helper text below the main text         |
| isDragging | `boolean`     | `false`                    | Whether the zone is in a dragging state |
| disabled   | `boolean`     | `false`                    | Whether the zone is disabled            |
| hideIcon   | `boolean`     | `false`                    | Hide the default icon                   |
| icon       | `JSX.Element` | -                          | Custom icon element to display          |
| class      | `string`      | -                          | Additional CSS class names              |
| id         | `string`      | -                          | Element id attribute                    |

### UploadFilePreview

| Prop          | Type         | Default      | Description                                  |
| ------------- | ------------ | ------------ | -------------------------------------------- |
| fileName      | `string`     | **required** | File name without extension                  |
| fileExtension | `string`     | **required** | File extension                               |
| fileSize      | `string`     | **required** | File size (formatted string, e.g., "2.4 MB") |
| progress      | `number`     | `0`          | Upload progress (0-100)                      |
| isComplete    | `boolean`    | `false`      | Whether the upload is complete               |
| thumbnailUrl  | `string`     | -            | Thumbnail URL for images                     |
| onRemove      | `() => void` | -            | Callback when remove button is clicked       |
| class         | `string`     | -            | Additional CSS class names                   |
| id            | `string`     | -            | Element id attribute                         |

## Examples

### Basic Example

```tsx
// Add example here
```
