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

## Theming

The UploadZone component can be customized using CSS variables. This allows you
to change the appearance of upload zones globally or override specific
instances.

### Available CSS Variables

| Variable                        | Default                   | Description                       |
| ------------------------------- | ------------------------- | --------------------------------- |
| `--uploadzone-min-height`       | `12rem`                   | Minimum height of the upload zone |
| `--uploadzone-padding`          | `2rem`                    | Inner padding                     |
| `--uploadzone-border-width`     | `2px`                     | Border width                      |
| `--uploadzone-border-color`     | `var(--border)`           | Border color                      |
| `--uploadzone-border-radius`    | `var(--radius)`           | Border radius                     |
| `--uploadzone-background`       | `var(--background)`       | Background color (default state)  |
| `--uploadzone-background-hover` | `var(--accent)`           | Background color on hover/drag    |
| `--uploadzone-icon-size`        | `3rem`                    | Size of the upload icon           |
| `--uploadzone-icon-color`       | `var(--muted-foreground)` | Color of the upload icon          |

### Theming Examples

#### Global Customization

Customize all upload zones by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* Larger upload zone */
    --uploadzone-min-height: 16rem;
    --uploadzone-padding: 3rem;

    /* Thicker border with custom color */
    --uploadzone-border-width: 3px;
    --uploadzone-border-color: hsl(var(--primary));

    /* More rounded corners */
    --uploadzone-border-radius: 1rem;

    /* Larger icon */
    --uploadzone-icon-size: 4rem;
    --uploadzone-icon-color: hsl(var(--primary));
}
```

#### Local Overrides

Override CSS variables for specific upload zone instances:

```tsx
<div style="--uploadzone-min-height: 8rem; --uploadzone-padding: 1rem;">
    <UploadZone text="Drop file here" helperText="Max 5MB" />
    {/* Compact upload zone */}
</div>

<div style="--uploadzone-border-width: 4px; --uploadzone-border-radius: 1.5rem; --uploadzone-icon-size: 5rem;">
    <UploadZone text="Drop your image" helperText="PNG, JPG up to 10MB" />
    {/* Large upload zone with prominent styling */}
</div>
```

#### Component-Specific Theming

Create themed sections with different upload zone styles:

```tsx
<div class="profile-upload" style={{
    '--uploadzone-min-height': '10rem',
    '--uploadzone-padding': '2rem',
    '--uploadzone-border-width': '2px',
    '--uploadzone-border-color': 'hsl(var(--primary))',
    '--uploadzone-border-radius': '50%',
    '--uploadzone-icon-size': '2.5rem',
    '--uploadzone-icon-color': 'hsl(var(--primary))'
}}>
    <UploadZone
        text="Upload avatar"
        helperText="JPG, PNG up to 2MB"
        hideIcon={false}
    />
</div>

<div class="document-upload" style={{
    '--uploadzone-min-height': '14rem',
    '--uploadzone-padding': '2.5rem',
    '--uploadzone-border-width': '3px',
    '--uploadzone-border-radius': '0.5rem',
    '--uploadzone-background': 'hsl(var(--muted))',
    '--uploadzone-background-hover': 'hsl(var(--accent))',
    '--uploadzone-icon-size': '3.5rem'
}}>
    <UploadZone
        text="Drop documents here or"
        browseText="select files"
        helperText="PDF, DOCX up to 25MB"
    />
</div>
```
