import {
    Card,
    CardContent,
    CodeBlock,
    InputFile,
    SingleImageUpload,
    UploadFileList,
    UploadFilePreview,
    UploadZone,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const UploadZonePage = () => {
    return (
        <PageUiLayout title='UploadZone - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        UPLOAD ZONE
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        A dropzone component for file uploads with customizable
                        appearance and file preview items.
                    </p>
                </header>

                {/* Basic Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC USAGE
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <UploadZone />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { UploadZone } from '@lockness/ui/components'

<UploadZone />`}
                    </CodeBlock>
                </section>

                {/* Custom Text */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM TEXT
                    </h2>
                    <p class='text-muted-foreground'>
                        Customize the dropzone text and helper message.
                    </p>
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
                </section>

                {/* Dragging State */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        DRAGGING STATE
                    </h2>
                    <p class='text-muted-foreground'>
                        The dropzone can show a visual indication when files are
                        being dragged over it.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <UploadZone isDragging />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<UploadZone isDragging />`}
                    </CodeBlock>
                </section>

                {/* Disabled State */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        DISABLED STATE
                    </h2>
                    <p class='text-muted-foreground'>
                        Disable the dropzone when uploads are not allowed.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <UploadZone disabled />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<UploadZone disabled />`}
                    </CodeBlock>
                </section>

                {/* Without Icon */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITHOUT ICON
                    </h2>
                    <p class='text-muted-foreground'>
                        Hide the default icon for a more compact design.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <UploadZone hideIcon />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<UploadZone hideIcon />`}
                    </CodeBlock>
                </section>

                {/* File Preview */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        FILE PREVIEW
                    </h2>
                    <p class='text-muted-foreground'>
                        Display uploaded files with progress and details using
                        the UploadFilePreview component.
                    </p>
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
                </section>

                {/* Complete Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COMPLETE EXAMPLE
                    </h2>
                    <p class='text-muted-foreground'>
                        Combine UploadZone with UploadFileList and
                        UploadFilePreview for a full upload experience.
                    </p>
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
                </section>

                {/* With Thumbnail */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH THUMBNAIL
                    </h2>
                    <p class='text-muted-foreground'>
                        Display image thumbnails for uploaded images.
                    </p>
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
                </section>

                {/* Single Image Upload */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SINGLE IMAGE UPLOAD
                    </h2>
                    <p class='text-muted-foreground'>
                        A circular upload component for single image uploads
                        like avatars or profile pictures.
                    </p>
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

                    <p class='text-muted-foreground'>
                        Different sizes:
                    </p>
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

                    <p class='text-muted-foreground'>
                        Custom button text:
                    </p>
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
                </section>

                {/* Input File */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INPUT FILE
                    </h2>
                    <p class='text-muted-foreground'>
                        A simple file input styled as a button with file name
                        display.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <InputFile />
                            <InputFile
                                fileName='document'
                                fileExtension='pdf'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { InputFile } from '@lockness/ui/components'

// Empty state
<InputFile />

// With selected file
<InputFile fileName="document" fileExtension="pdf" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Custom text:
                    </p>
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

                    <p class='text-muted-foreground'>
                        Disabled state:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <InputFile disabled />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<InputFile disabled />`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>

                    <h3 class='font-pixel text-xs text-foreground'>
                        UploadZone Props
                    </h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Prop
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Type
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Default
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='divide-y'>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        text
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'Drop your file here or'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Main text to display
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        browseText
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'browse'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Browse link text
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        helperText
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'Pick a file up to 2MB.'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Helper text below main text
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        isDragging
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Visual dragging state
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        disabled
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Disabled state
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        hideIcon
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Hide the default icon
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        icon
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        JSX.Element
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Custom icon element
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        UploadFilePreview Props
                    </h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Prop
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Type
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Default
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='divide-y'>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fileName
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        File name without extension
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fileExtension
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        File extension
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fileSize
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Formatted file size (e.g., "2.4 MB")
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        progress
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        0
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Upload progress (0-100)
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        isComplete
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Whether upload is complete (green bar)
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        thumbnailUrl
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Thumbnail URL for images
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        onRemove
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        () =&gt; void
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Remove button callback
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        SingleImageUpload Props
                    </h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Prop
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Type
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Default
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='divide-y'>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        imageUrl
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        URL of the current image
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        size
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'sm' | 'default' | 'lg'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'default'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Size of the circular preview
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        uploadText
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'Upload photo'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Text for upload button
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        deleteText
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'Delete'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Text for delete button
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        onUpload
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        () =&gt; void
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Upload button callback
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        onDelete
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        () =&gt; void
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Delete button callback
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        InputFile Props
                    </h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Prop
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Type
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Default
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='divide-y'>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fileName
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Selected file name
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fileExtension
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        File extension
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        buttonText
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'Browse'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Text for browse button
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        placeholder
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'No file chosen'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Placeholder text when no file selected
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        disabled
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Disabled state
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Accessibility */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        ACCESSIBILITY
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <ul class='list-disc list-inside space-y-2 text-muted-foreground'>
                                <li>
                                    The dropzone is keyboard accessible and can
                                    be focused
                                </li>
                                <li>
                                    Remove buttons have proper aria-label
                                    attributes
                                </li>
                                <li>
                                    Progress bars use proper progressbar ARIA
                                    roles
                                </li>
                                <li>
                                    File previews show clear file information
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
