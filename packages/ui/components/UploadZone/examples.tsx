/**
 * @fileoverview Live examples for UploadZone component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import {
    InputFile,
    SingleImageUpload,
    UploadFileList,
    UploadFilePreview,
    UploadZone,
} from './mod.tsx'

const uploadZoneProps: PropDefinition[] = [
    {
        name: 'text',
        type: 'string',
        default: 'Drop your file here or',
        description: 'Main text to display',
    },
    {
        name: 'browseText',
        type: 'string',
        default: 'browse',
        description: 'Browse link text',
    },
    {
        name: 'helperText',
        type: 'string',
        default: 'Pick a file up to 2MB.',
        description: 'Helper text below the main text',
    },
    {
        name: 'isDragging',
        type: 'boolean',
        default: 'false',
        description: 'Whether the zone is in a dragging state',
    },
    {
        name: 'disabled',
        type: 'boolean',
        default: 'false',
        description: 'Whether the zone is disabled',
    },
    {
        name: 'hideIcon',
        type: 'boolean',
        default: 'false',
        description: 'Hide the default icon',
    },
    {
        name: 'icon',
        type: 'JSX.Element',
        description: 'Custom icon element to display',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const uploadFilePreviewProps: PropDefinition[] = [
    {
        name: 'fileName',
        type: 'string',
        required: true,
        description: 'File name without extension',
    },
    {
        name: 'fileExtension',
        type: 'string',
        required: true,
        description: 'File extension',
    },
    {
        name: 'fileSize',
        type: 'string',
        required: true,
        description: 'File size (formatted string)',
    },
    {
        name: 'progress',
        type: 'number',
        default: '0',
        description: 'Upload progress (0-100)',
    },
    {
        name: 'isComplete',
        type: 'boolean',
        default: 'false',
        description: 'Whether the upload is complete',
    },
    {
        name: 'thumbnailUrl',
        type: 'string',
        description: 'Thumbnail URL for images',
    },
    {
        name: 'onRemove',
        type: '() => void',
        description: 'Callback when remove button is clicked',
    },
]

export interface ExampleSection {
    title: string
    description?: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    {
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <UploadZone />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { UploadZone } from '@lockness/ui/components'

<UploadZone />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Text',
        description: 'Customize the dropzone text and helper message.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <UploadZone
                            text='Drag and drop your images here or'
                            browseText='select files'
                            helperText='PNG, JPG, GIF up to 10MB'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadZone
  text="Drag and drop your images here or"
  browseText="select files"
  helperText="PNG, JPG, GIF up to 10MB"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Dragging State',
        description:
            'The dropzone can show a visual indication when files are being dragged over it.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <UploadZone isDragging />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadZone isDragging />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Disabled State',
        description: 'Disable the dropzone when uploads are not allowed.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <UploadZone disabled />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadZone disabled />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Without Icon',
        description: 'Hide the default icon for a more compact design.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <UploadZone hideIcon />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadZone hideIcon />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'File Preview',
        description:
            'Display uploaded files with progress and details using the UploadFilePreview component.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <UploadFilePreview
                            fileName='document'
                            fileExtension='pdf'
                            fileSize='2.4 MB'
                            progress={75}
                        />
                        <UploadFilePreview
                            fileName='spreadsheet'
                            fileExtension='xlsx'
                            fileSize='1.2 MB'
                            progress={100}
                            isComplete
                        />
                        <UploadFilePreview
                            fileName='report'
                            fileExtension='docx'
                            fileSize='500 KB'
                            progress={30}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadFilePreview
  fileName="document"
  fileExtension="pdf"
  fileSize="2.4 MB"
  progress={75}
/>

<UploadFilePreview
  fileName="spreadsheet"
  fileExtension="xlsx"
  fileSize="1.2 MB"
  progress={100}
  isComplete
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Complete Example',
        description:
            'Combine UploadZone with UploadFileList and UploadFilePreview for a full upload experience.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <UploadZone
                            text='Drop your files here or'
                            browseText='browse'
                            helperText='PDF, DOC, XLS up to 5MB each'
                        />
                        <UploadFileList>
                            <UploadFilePreview
                                fileName='annual-report-2024'
                                fileExtension='pdf'
                                fileSize='3.2 MB'
                                progress={100}
                                isComplete
                            />
                            <UploadFilePreview
                                fileName='budget-forecast'
                                fileExtension='xlsx'
                                fileSize='1.8 MB'
                                progress={65}
                            />
                        </UploadFileList>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadZone
  text="Drop your files here or"
  browseText="browse"
  helperText="PDF, DOC, XLS up to 5MB each"
/>
<UploadFileList>
  <UploadFilePreview
    fileName="annual-report-2024"
    fileExtension="pdf"
    fileSize="3.2 MB"
    progress={100}
    isComplete
  />
  <UploadFilePreview
    fileName="budget-forecast"
    fileExtension="xlsx"
    fileSize="1.8 MB"
    progress={65}
  />
</UploadFileList>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Thumbnail',
        description: 'Display image thumbnails for uploaded images.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <UploadFilePreview
                            fileName='vacation-photo'
                            fileExtension='jpg'
                            fileSize='4.5 MB'
                            progress={100}
                            isComplete
                            thumbnailUrl='https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100&fit=crop'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<UploadFilePreview
  fileName="vacation-photo"
  fileExtension="jpg"
  fileSize="4.5 MB"
  progress={100}
  isComplete
  thumbnailUrl="/path/to/thumbnail.jpg"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Single Image Upload',
        description:
            'A circular upload component for single image uploads like avatars or profile pictures.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <SingleImageUpload />
                        <SingleImageUpload imageUrl='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { SingleImageUpload } from '@lockness/ui/components'

// Empty state
<SingleImageUpload />

// With image preview
<SingleImageUpload imageUrl="/path/to/avatar.jpg" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Single Image Upload Sizes',
        description: 'Different sizes for the circular upload component.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <SingleImageUpload size='sm' />
                        <SingleImageUpload size='default' />
                        <SingleImageUpload size='lg' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SingleImageUpload size="sm" />
<SingleImageUpload size="default" />
<SingleImageUpload size="lg" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Single Image Upload Custom Text',
        description: 'Custom button text for the single image upload.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <SingleImageUpload
                            uploadText='Change avatar'
                            deleteText='Remove'
                            imageUrl='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SingleImageUpload
  uploadText="Change avatar"
  deleteText="Remove"
  imageUrl="/path/to/avatar.jpg"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Input File',
        description:
            'A simple file input styled as a button with file name display.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <InputFile />
                        <InputFile fileName='document' fileExtension='pdf' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { InputFile } from '@lockness/ui/components'

// Empty state
<InputFile />

// With selected file
<InputFile fileName="document" fileExtension="pdf" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Input File Custom Text',
        description: 'Customize the button and placeholder text.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <InputFile
                            buttonText='Select'
                            placeholder='No file selected'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<InputFile
  buttonText="Select"
  placeholder="No file selected"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Input File Disabled',
        description: 'Disabled state for the input file.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <InputFile disabled />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<InputFile disabled />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable title='UploadZone' props={uploadZoneProps} />
                <PropsTable
                    title='UploadFilePreview'
                    props={uploadFilePreviewProps}
                />
            </div>
        ),
    },
]
