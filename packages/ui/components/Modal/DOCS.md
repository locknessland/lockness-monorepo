# Modal

Modal dialog component built on the native HTML `<dialog>` element. Supports
both native dialog and Unpoly layer modes. Includes header, body, footer
sections with close button support.

## Installation

```bash
deno run -A jsr:@lockness/ui add modal
```

## Usage

```tsx
import { 
  Modal, 
  ModalTrigger, 
  ModalContent, 
  ModalHeader, 
  ModalTitle, 
  ModalDescription,
  ModalBody, 
  ModalFooter, 
  ModalClose,
  ModalCloseIcon 
} from '@lockness/ui/components'

<ModalTrigger targetId="my-modal">Open Modal</ModalTrigger>

<Modal id="my-modal">
  <ModalContent>
    <ModalHeader>
      <ModalTitle>Modal Title</ModalTitle>
      <ModalCloseIcon />
    </ModalHeader>
    <ModalBody>
      <p>Modal content goes here.</p>
    </ModalBody>
    <ModalFooter>
      <ModalClose>Cancel</ModalClose>
      <Button>Confirm</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

## Components

### Modal

The main dialog container using the native `<dialog>` element.

```tsx
<Modal id='unique-modal-id'>
    {/* Modal content */}
</Modal>
```

### ModalTrigger

Button or link that opens the modal. Supports both native dialog and Unpoly
modes.

```tsx
// Native dialog trigger
<ModalTrigger targetId="my-modal">Open Modal</ModalTrigger>

// Unpoly layer trigger (loads content from URL)
<ModalTrigger href="/modal-content">Load Modal</ModalTrigger>

// With variant
<ModalTrigger targetId="my-modal" variant="outline">Open</ModalTrigger>
```

### ModalContent

Wrapper for modal sections (header, body, footer).

```tsx
<ModalContent>
    {/* Modal sections */}
</ModalContent>
```

### ModalHeader

Top section containing title and close button.

```tsx
<ModalHeader>
    <ModalTitle>Title</ModalTitle>
    <ModalCloseIcon />
</ModalHeader>
```

### ModalTitle

Main heading text for the modal.

```tsx
<ModalTitle>Confirm Action</ModalTitle>
```

### ModalDescription

Subtitle or additional context text.

```tsx
<ModalDescription>This action cannot be undone.</ModalDescription>
```

### ModalBody

Scrollable main content area.

```tsx
<ModalBody>
    <p>Your modal content here...</p>
</ModalBody>
```

### ModalFooter

Bottom section for action buttons.

```tsx
<ModalFooter>
    <ModalClose>Cancel</ModalClose>
    <Button>Confirm</Button>
</ModalFooter>
```

### ModalClose

Button that closes the modal.

```tsx
<ModalClose>Cancel</ModalClose>
<ModalClose size="md">Done</ModalClose>
```

### ModalCloseIcon

X button for the header area.

```tsx
<ModalCloseIcon />
```

## Props

### ModalProps

| Prop     | Type      | Default      | Description                            |
| -------- | --------- | ------------ | -------------------------------------- |
| id       | `string`  | **required** | Unique identifier for the modal dialog |
| children | `unknown` | -            | Modal content                          |
| class    | `string`  | -            | Additional CSS class names             |

### ModalTriggerProps

| Prop     | Type                                               | Default     | Description                                   |
| -------- | -------------------------------------------------- | ----------- | --------------------------------------------- |
| targetId | `string`                                           | -           | ID of the target modal (for native dialog)    |
| href     | `string`                                           | -           | URL to load in Unpoly layer (for Unpoly mode) |
| variant  | `'primary' \| 'secondary' \| 'outline' \| 'ghost'` | `'primary'` | Visual style variant                          |
| children | `unknown`                                          | -           | Button content                                |
| class    | `string`                                           | -           | Additional CSS class names                    |

### ModalCloseProps

| Prop     | Type                   | Default   | Description                |
| -------- | ---------------------- | --------- | -------------------------- |
| size     | `'sm' \| 'md' \| 'lg'` | `'sm'`    | Button size                |
| children | `unknown`              | `'Close'` | Button content             |
| class    | `string`               | -         | Additional CSS class names |

## Complete Example

```tsx
<ModalTrigger targetId="delete-modal" variant="destructive">
  Delete Item
</ModalTrigger>

<Modal id="delete-modal">
  <ModalContent>
    <ModalHeader>
      <div>
        <ModalTitle>Delete Item</ModalTitle>
        <ModalDescription>
          This action cannot be undone.
        </ModalDescription>
      </div>
      <ModalCloseIcon />
    </ModalHeader>
    <ModalBody>
      <p>
        Are you sure you want to delete this item? 
        All associated data will be permanently removed.
      </p>
    </ModalBody>
    <ModalFooter>
      <ModalClose>Cancel</ModalClose>
      <Button variant="destructive">Delete</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

## Unpoly Integration

For dynamic content loading, use the `href` prop on ModalTrigger:

```tsx
<ModalTrigger href='/api/user/edit' variant='outline'>
    Edit Profile
</ModalTrigger>
```

This creates an Unpoly layer with:

- `up-layer="new"` - Opens as new layer
- `up-size="medium"` - Medium-sized modal
- `up-dismissable="button"` - Close via button only

## Features

- **Native Dialog**: Uses the HTML `<dialog>` element for proper accessibility
- **Backdrop Click**: Closes when clicking outside the modal
- **Keyboard Support**: Escape key closes the modal
- **Focus Management**: Proper focus trapping within modal
- **Animations**: Fade-in and zoom animations on open
- **Scrollable Content**: Body section scrolls for long content
- **Max Height**: Limited to 90vh with overflow handling

## CSS Variables

```css
@theme {
    --modal-header-padding-x: 1.5rem;
    --modal-header-padding-y: 1rem;
    --modal-body-padding-x: 1.5rem;
    --modal-body-padding-y: 1rem;
    --modal-footer-padding-x: 1.5rem;
    --modal-footer-padding-y: 1rem;
    --radius: 0.5rem;
}
```
