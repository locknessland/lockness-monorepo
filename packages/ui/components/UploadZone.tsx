/**
 * @fileoverview File upload dropzone component.
 *
 * Drag-and-drop file upload area with preview and progress support.
 *
 * @module @lockness/ui/components/upload-zone
 */

import type { FC } from '@lockness/core'
import type { JSX } from '@lockness/core/jsx-runtime'
import { cn } from '../lib/utils.ts'
import { Progress } from './Progress.tsx'

/**
 * UploadZone component props
 */
export interface UploadZoneProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Main text to display
     * @default 'Drop your file here or'
     */
    text?: string
    /**
     * Browse link text
     * @default 'browse'
     */
    browseText?: string
    /**
     * Helper text below the main text
     * @default 'Pick a file up to 2MB.'
     */
    helperText?: string
    /**
     * Whether the zone is in a dragging state
     * @default false
     */
    isDragging?: boolean
    /**
     * Whether the zone is disabled
     * @default false
     */
    disabled?: boolean
    /**
     * Hide the default icon
     * @default false
     */
    hideIcon?: boolean
    /**
     * Custom icon element to display
     */
    icon?: JSX.Element
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
}

/**
 * UploadFilePreview component props
 */
export interface UploadFilePreviewProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * File name without extension
     */
    fileName: string
    /**
     * File extension
     */
    fileExtension: string
    /**
     * File size (formatted string, e.g., "2.4 MB")
     */
    fileSize: string
    /**
     * Upload progress (0-100)
     * @default 0
     */
    progress?: number
    /**
     * Whether the upload is complete
     * @default false
     */
    isComplete?: boolean
    /**
     * Thumbnail URL for images
     */
    thumbnailUrl?: string
    /**
     * Callback when remove button is clicked
     */
    onRemove?: () => void
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
}

/**
 * Default upload icon SVG
 */
const DefaultUploadIcon = () => (
    <svg
        class='shrink-0 w-16 h-auto'
        width='71'
        height='51'
        viewBox='0 0 71 51'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
    >
        <path
            d='M6.55172 8.74547L17.7131 6.88524V40.7377L12.8018 41.7717C9.51306 42.464 6.29705 40.3203 5.67081 37.0184L1.64319 15.7818C1.01599 12.4748 3.23148 9.29884 6.55172 8.74547Z'
            stroke='currentColor'
            stroke-width='2'
            class='stroke-primary'
        />
        <path
            d='M64.4483 8.74547L53.2869 6.88524V40.7377L58.1982 41.7717C61.4869 42.464 64.703 40.3203 65.3292 37.0184L69.3568 15.7818C69.984 12.4748 67.7685 9.29884 64.4483 8.74547Z'
            stroke='currentColor'
            stroke-width='2'
            class='stroke-primary'
        />
        <g filter='url(#filter-upload-icon)'>
            <rect
                x='17.5656'
                y='1'
                width='35.8689'
                height='42.7541'
                rx='5'
                stroke='currentColor'
                stroke-width='2'
                class='stroke-primary'
                shape-rendering='crispEdges'
            />
        </g>
        <path
            d='M39.4826 33.0893C40.2331 33.9529 41.5385 34.0028 42.3537 33.2426L42.5099 33.0796L47.7453 26.976L53.4347 33.0981V38.7544C53.4346 41.5156 51.1959 43.7542 48.4347 43.7544H22.5656C19.8043 43.7544 17.5657 41.5157 17.5656 38.7544V35.2934L29.9728 22.145L39.4826 33.0893Z'
            class='fill-primary/10 stroke-primary'
            fill='currentColor'
            stroke='currentColor'
            stroke-width='2'
        />
        <circle
            cx='40.0902'
            cy='14.3443'
            r='4.16393'
            class='fill-primary/10 stroke-primary'
            fill='currentColor'
            stroke='currentColor'
            stroke-width='2'
        />
        <defs>
            <filter
                id='filter-upload-icon'
                x='13.5656'
                y='0'
                width='43.8689'
                height='50.7541'
                filterUnits='userSpaceOnUse'
                color-interpolation-filters='sRGB'
            >
                <feFlood flood-opacity='0' result='BackgroundImageFix' />
                <feColorMatrix
                    in='SourceAlpha'
                    type='matrix'
                    values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
                    result='hardAlpha'
                />
                <feOffset dy='3' />
                <feGaussianBlur stdDeviation='1.5' />
                <feComposite in2='hardAlpha' operator='out' />
                <feColorMatrix
                    type='matrix'
                    values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0'
                />
                <feBlend
                    mode='normal'
                    in2='BackgroundImageFix'
                    result='effect'
                />
                <feBlend
                    mode='normal'
                    in='SourceGraphic'
                    in2='effect'
                    result='shape'
                />
            </filter>
        </defs>
    </svg>
)

/**
 * File icon for non-image files
 */
const FileIcon = () => (
    <svg
        class='shrink-0 size-5'
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' />
        <path d='M14 2v4a2 2 0 0 0 2 2h4' />
    </svg>
)

/**
 * Trash icon for remove button
 */
const TrashIcon = () => (
    <svg
        class='shrink-0 size-4'
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M3 6h18' />
        <path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' />
        <path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' />
        <line x1='10' x2='10' y1='11' y2='17' />
        <line x1='14' x2='14' y1='11' y2='17' />
    </svg>
)

/**
 * UploadZone Component
 *
 * A dropzone area for file uploads with customizable appearance.
 * Pure CSS implementation matching the theme.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <UploadZone />
 *
 * // Custom text
 * <UploadZone
 *   text="Drag and drop your images here or"
 *   browseText="select files"
 *   helperText="PNG, JPG up to 10MB"
 * />
 *
 * // With dragging state
 * <UploadZone isDragging />
 *
 * // Disabled state
 * <UploadZone disabled />
 *
 * // Custom icon
 * <UploadZone icon={<MyCustomIcon />} />
 *
 * // Without icon
 * <UploadZone hideIcon />
 * ```
 */
export const UploadZone: FC<UploadZoneProps> = ({
    text = 'Drop your file here or',
    browseText = 'browse',
    helperText = 'Pick a file up to 2MB.',
    isDragging = false,
    disabled = false,
    hideIcon = false,
    icon,
    class: className,
    id,
    children,
    ...props
}) => {
    return (
        <div
            id={id}
            class={cn(
                'cursor-pointer p-12 flex justify-center bg-card border border-dashed border-border transition-colors duration-200',
                isDragging && 'border-primary bg-primary/5',
                disabled && 'opacity-50 cursor-not-allowed',
                className,
            )}
            style='border-radius: var(--radius)'
            {...props}
        >
            <div class='text-center'>
                {!hideIcon && (
                    <span class='inline-flex justify-center items-center size-16'>
                        {icon || <DefaultUploadIcon />}
                    </span>
                )}

                <div class='mt-4 flex flex-wrap justify-center text-sm text-muted-foreground'>
                    <span class='pe-1 font-medium text-foreground'>
                        {text}
                    </span>
                    <span class='font-semibold text-primary hover:text-primary/80 decoration-2 hover:underline cursor-pointer'>
                        {browseText}
                    </span>
                </div>

                {helperText && (
                    <p class='mt-1 text-xs text-muted-foreground'>
                        {helperText}
                    </p>
                )}

                {children}
            </div>
        </div>
    )
}

/**
 * UploadFilePreview Component
 *
 * A file preview item showing upload progress and file details.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <UploadFilePreview
 *   fileName="document"
 *   fileExtension="pdf"
 *   fileSize="2.4 MB"
 *   progress={75}
 * />
 *
 * // Completed upload
 * <UploadFilePreview
 *   fileName="photo"
 *   fileExtension="jpg"
 *   fileSize="1.2 MB"
 *   progress={100}
 *   isComplete
 *   thumbnailUrl="/uploads/photo.jpg"
 * />
 *
 * // With remove handler
 * <UploadFilePreview
 *   fileName="report"
 *   fileExtension="xlsx"
 *   fileSize="500 KB"
 *   progress={100}
 *   isComplete
 *   onRemove={() => handleRemove(file.id)}
 * />
 * ```
 */
export const UploadFilePreview: FC<UploadFilePreviewProps> = ({
    fileName,
    fileExtension,
    fileSize,
    progress = 0,
    isComplete = false,
    thumbnailUrl,
    onRemove,
    class: className,
    id,
    ...props
}) => {
    return (
        <div
            id={id}
            class={cn('p-3 bg-card border border-border', className)}
            style='border-radius: var(--radius)'
            {...props}
        >
            <div class='mb-2 flex justify-between items-center'>
                <div class='flex items-center gap-x-3'>
                    <span
                        class='size-10 flex justify-center items-center border border-border text-muted-foreground'
                        style='border-radius: var(--radius)'
                    >
                        {thumbnailUrl
                            ? (
                                <img
                                    src={thumbnailUrl}
                                    alt={`${fileName}.${fileExtension}`}
                                    class='size-full object-cover'
                                    style='border-radius: var(--radius)'
                                />
                            )
                            : <FileIcon />}
                    </span>
                    <div>
                        <p class='text-sm font-medium text-foreground'>
                            <span class='truncate inline-block max-w-50 align-bottom'>
                                {fileName}
                            </span>
                            .{fileExtension}
                        </p>
                        <p class='text-xs text-muted-foreground'>{fileSize}</p>
                    </div>
                </div>
                {onRemove && (
                    <div class='flex items-center gap-x-2'>
                        <button
                            type='button'
                            class='text-muted-foreground hover:text-foreground focus:outline-none focus:text-foreground transition-colors'
                            onClick={onRemove}
                            aria-label={`Remove ${fileName}.${fileExtension}`}
                        >
                            <TrashIcon />
                        </button>
                    </div>
                )}
            </div>

            <Progress
                value={progress}
                variant={isComplete ? 'success' : 'default'}
                endLabel
            />
        </div>
    )
}

/**
 * UploadFileList Component
 *
 * A container for file preview items with proper spacing.
 */
export interface UploadFileListProps
    extends Omit<JSX.IntrinsicElements['div'], 'class'> {
    /**
     * Additional CSS class names
     */
    class?: string
}

export const UploadFileList: FC<UploadFileListProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('mt-4 space-y-2 empty:mt-0', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * SingleImageUpload component props
 */
export interface SingleImageUploadProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Current image URL (preview)
     */
    imageUrl?: string
    /**
     * Upload button text
     * @default 'Upload photo'
     */
    uploadText?: string
    /**
     * Delete button text
     * @default 'Delete'
     */
    deleteText?: string
    /**
     * Whether the component is disabled
     * @default false
     */
    disabled?: boolean
    /**
     * Size of the preview circle
     * @default 'default'
     */
    size?: 'sm' | 'default' | 'lg'
    /**
     * Callback when upload button is clicked
     */
    onUpload?: () => void
    /**
     * Callback when delete button is clicked
     */
    onDelete?: () => void
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
}

const singleImageSizeStyles = {
    sm: 'size-14',
    default: 'size-20',
    lg: 'size-28',
}

const singleImageIconSizeStyles = {
    sm: 'size-5',
    default: 'size-7',
    lg: 'size-9',
}

/**
 * Avatar/User icon for empty state
 */
const AvatarIcon: FC<{ class?: string }> = ({ class: className }) => (
    <svg
        class={cn('shrink-0', className)}
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='1.5'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <circle cx='12' cy='12' r='10' />
        <circle cx='12' cy='10' r='3' />
        <path d='M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662' />
    </svg>
)

/**
 * Upload icon
 */
const UploadIcon = () => (
    <svg
        class='shrink-0 size-4'
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
        <polyline points='17 8 12 3 7 8' />
        <line x1='12' x2='12' y1='3' y2='15' />
    </svg>
)

/**
 * SingleImageUpload Component
 *
 * A circular upload component for single image uploads like avatars/profile pictures.
 *
 * @example
 * ```tsx
 * // Basic usage (empty state)
 * <SingleImageUpload />
 *
 * // With image preview
 * <SingleImageUpload imageUrl="/path/to/avatar.jpg" />
 *
 * // Custom button text
 * <SingleImageUpload
 *   uploadText="Change avatar"
 *   deleteText="Remove"
 * />
 *
 * // Different sizes
 * <SingleImageUpload size="sm" />
 * <SingleImageUpload size="lg" />
 *
 * // With callbacks
 * <SingleImageUpload
 *   imageUrl={user.avatar}
 *   onUpload={() => openFilePicker()}
 *   onDelete={() => removeAvatar()}
 * />
 * ```
 */
export const SingleImageUpload: FC<SingleImageUploadProps> = ({
    imageUrl,
    uploadText = 'Upload photo',
    deleteText = 'Delete',
    disabled = false,
    size = 'default',
    onUpload,
    onDelete,
    class: className,
    id,
    ...props
}) => {
    return (
        <div
            id={id}
            class={cn('flex flex-wrap items-center gap-3 sm:gap-5', className)}
            {...props}
        >
            {/* Preview area */}
            <div class='group'>
                {imageUrl
                    ? (
                        <div
                            class={singleImageSizeStyles[size]}
                            style='border-radius: var(--radius); overflow: hidden'
                        >
                            <img
                                src={imageUrl}
                                alt='Preview'
                                class='w-full h-full object-cover'
                            />
                        </div>
                    )
                    : (
                        <span
                            class={cn(
                                'flex shrink-0 justify-center items-center border-2 border-dashed border-border text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors',
                                singleImageSizeStyles[size],
                                disabled && 'opacity-50 cursor-not-allowed',
                            )}
                            style='border-radius: var(--radius)'
                            onClick={disabled ? undefined : onUpload}
                        >
                            <AvatarIcon
                                class={singleImageIconSizeStyles[size]}
                            />
                        </span>
                    )}
            </div>

            {/* Buttons */}
            <div class='grow'>
                <div class='flex items-center gap-x-2'>
                    <button
                        type='button'
                        class='py-2 px-3 inline-flex items-center gap-x-2 text-xs font-medium rounded-lg border border-transparent bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none transition-colors'
                        style='border-radius: var(--radius)'
                        disabled={disabled}
                        onClick={onUpload}
                    >
                        <UploadIcon />
                        {uploadText}
                    </button>
                    {imageUrl && (
                        <button
                            type='button'
                            class='py-2 px-3 inline-flex items-center gap-x-2 text-xs font-semibold rounded-lg border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted focus:outline-none focus:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors'
                            style='border-radius: var(--radius)'
                            disabled={disabled}
                            onClick={onDelete}
                        >
                            {deleteText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * InputFile component props
 */
export interface InputFileProps
    extends Omit<JSX.IntrinsicElements['button'], 'class' | 'id'> {
    /**
     * Current file name (without extension)
     */
    fileName?: string
    /**
     * Current file extension
     */
    fileExtension?: string
    /**
     * Placeholder text when no file is selected
     * @default 'No Chosen File'
     */
    placeholder?: string
    /**
     * Button text
     * @default 'Choose File'
     */
    buttonText?: string
    /**
     * Whether the component is disabled
     * @default false
     */
    disabled?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
}

/**
 * InputFile Component
 *
 * A simple file input styled as a button with file name display.
 *
 * @example
 * ```tsx
 * // Basic usage (empty state)
 * <InputFile />
 *
 * // With selected file
 * <InputFile fileName="document" fileExtension="pdf" />
 *
 * // Custom text
 * <InputFile
 *   buttonText="Select"
 *   placeholder="No file selected"
 * />
 *
 * // Disabled state
 * <InputFile disabled />
 * ```
 */
export const InputFile: FC<InputFileProps> = ({
    fileName,
    fileExtension,
    placeholder = 'No Chosen File',
    buttonText = 'Choose File',
    disabled = false,
    class: className,
    id,
    ...props
}) => {
    const hasFile = fileName && fileExtension

    return (
        <button
            type='button'
            id={id}
            class={cn(
                'relative flex w-full border overflow-hidden border-border shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:pointer-events-none bg-card transition-colors',
                className,
            )}
            style='border-radius: var(--radius)'
            disabled={disabled}
            {...props}
        >
            <span class='h-full py-3 px-4 bg-muted text-nowrap border-r border-border'>
                {buttonText}
            </span>
            <span class='group grow flex overflow-hidden h-full py-3 px-4 text-left'>
                {hasFile
                    ? (
                        <span class='flex items-center w-full text-foreground'>
                            <span class='grow-0 overflow-hidden truncate'>
                                {fileName}
                            </span>
                            <span class='grow-0'>.</span>
                            <span class='grow-0'>{fileExtension}</span>
                        </span>
                    )
                    : <span class='text-muted-foreground'>{placeholder}</span>}
            </span>
        </button>
    )
}
