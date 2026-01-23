/**
 * @fileoverview Live examples for TreeView component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { TreeView, TreeViewItem } from './mod.tsx'
import type { TreeViewDataItem } from './mod.tsx'

const treeViewProps: PropDefinition[] = [
    {
        name: 'items',
        type: 'TreeViewDataItem[]',
        description: 'Data-driven tree structure (alternative to children)',
    },
    {
        name: 'variant',
        type: 'interactive | text',
        default: 'interactive',
        description: 'Display variant',
    },
    {
        name: 'rootLabel',
        type: 'string',
        description: 'Root label for text variant',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const treeViewItemProps: PropDefinition[] = [
    {
        name: 'label',
        type: 'string',
        required: true,
        description: 'Item label text',
    },
    {
        name: 'id',
        type: 'string',
        description: 'Unique identifier for this item',
    },
    {
        name: 'hasChildren',
        type: 'boolean',
        description: 'Whether item has children (is a branch vs leaf)',
    },
    {
        name: 'defaultExpanded',
        type: 'boolean',
        description: 'Whether item is initially expanded',
    },
    {
        name: 'selectable',
        type: 'boolean',
        description: 'Whether item is selectable',
    },
    {
        name: 'defaultSelected',
        type: 'boolean',
        description: 'Whether item is initially selected',
    },
    { name: 'icon', type: 'unknown', description: 'Optional icon element' },
    {
        name: 'onClick',
        type: '(event: Event) => void',
        description: 'Click handler for item selection',
    },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

// File system icons (inline SVG)
const FolderIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z' />
    </svg>
)

const FileIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' />
        <polyline points='14 2 14 8 20 8' />
    </svg>
)

const ComponentIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <polyline points='16 18 22 12 16 6' />
        <polyline points='8 6 2 12 8 18' />
    </svg>
)

// Data for data-driven tree
const fileSystemData: TreeViewDataItem[] = [
    {
        id: 'src',
        label: 'src',
        icon: <FolderIcon />,
        defaultExpanded: true,
        children: [
            {
                id: 'components',
                label: 'components',
                icon: <FolderIcon />,
                defaultExpanded: true,
                children: [
                    {
                        id: 'button',
                        label: 'Button.tsx',
                        icon: <ComponentIcon />,
                    },
                    { id: 'card', label: 'Card.tsx', icon: <ComponentIcon /> },
                    {
                        id: 'treeview',
                        label: 'TreeView.tsx',
                        icon: <ComponentIcon />,
                    },
                ],
            },
            {
                id: 'utils',
                label: 'utils',
                icon: <FolderIcon />,
                children: [
                    { id: 'cn', label: 'cn.ts', icon: <FileIcon /> },
                    { id: 'format', label: 'format.ts', icon: <FileIcon /> },
                ],
            },
        ],
    },
    {
        id: 'public',
        label: 'public',
        icon: <FolderIcon />,
        children: [
            { id: 'favicon', label: 'favicon.ico', icon: <FileIcon /> },
            { id: 'robots', label: 'robots.txt', icon: <FileIcon /> },
        ],
    },
    { id: 'package', label: 'package.json', icon: <FileIcon /> },
]

export const examples: ExampleSection[] = [
    {
        title: 'Basic Tree',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <TreeView>
                            <TreeViewItem
                                label='Documents'
                                hasChildren
                                defaultExpanded
                            >
                                <TreeViewItem
                                    label='Work'
                                    hasChildren
                                    defaultExpanded
                                >
                                    <TreeViewItem label='Report.pdf' />
                                    <TreeViewItem label='Presentation.pptx' />
                                </TreeViewItem>
                                <TreeViewItem label='Personal' hasChildren>
                                    <TreeViewItem label='Resume.pdf' />
                                    <TreeViewItem label='Cover Letter.docx' />
                                </TreeViewItem>
                            </TreeViewItem>
                            <TreeViewItem label='Pictures' hasChildren>
                                <TreeViewItem label='Vacation.jpg' />
                                <TreeViewItem label='Family.png' />
                            </TreeViewItem>
                            <TreeViewItem label='README.md' />
                        </TreeView>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { TreeView, TreeViewItem } from '@lockness/ui/components'

<TreeView>
  <TreeViewItem label="Parent" hasChildren defaultExpanded>
    <TreeViewItem label="Child 1" />
    <TreeViewItem label="Child 2" hasChildren>
      <TreeViewItem label="Grandchild" />
    </TreeViewItem>
  </TreeViewItem>
  <TreeViewItem label="Another Parent" />
</TreeView>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'File System Tree (Data-Driven)',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <TreeView items={fileSystemData} />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { TreeView } from '@lockness/ui/components'

const data = [
  {
    id: '1',
    label: 'Parent',
    defaultExpanded: true,
    children: [
      { id: '1-1', label: 'Child 1' },
      {
        id: '1-2',
        label: 'Child 2',
        children: [
          { id: '1-2-1', label: 'Grandchild' }
        ]
      }
    ]
  },
  { id: '2', label: 'Another Parent' }
]

<TreeView items={data} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Text Variant (ASCII Tree)',
        render: () => (
            <div class='space-y-4'>
                <p class='text-sm text-muted-foreground'>
                    Static ASCII representation, perfect for documentation or
                    code examples.
                </p>
                <Card>
                    <CardContent class='p-6'>
                        <TreeView
                            items={[
                                {
                                    id: 'app',
                                    label: 'app/',
                                    children: [
                                        {
                                            id: 'controller',
                                            label: 'controller/',
                                        },
                                        { id: 'model', label: 'model/' },
                                        {
                                            id: 'view',
                                            label: 'view/',
                                            children: [
                                                {
                                                    id: 'components',
                                                    label: 'components/',
                                                },
                                                {
                                                    id: 'layouts',
                                                    label: 'layouts/',
                                                },
                                                {
                                                    id: 'pages',
                                                    label: 'pages/',
                                                },
                                            ],
                                        },
                                        { id: 'kernel', label: 'kernel.tsx' },
                                        { id: 'routes', label: 'routes.ts' },
                                    ],
                                },
                                {
                                    id: 'public',
                                    label: 'public/',
                                    children: [
                                        { id: 'css', label: 'css/' },
                                        { id: 'img', label: 'img/' },
                                    ],
                                },
                                { id: 'main', label: 'main.ts' },
                                { id: 'deno', label: 'deno.json' },
                            ]}
                            variant='text'
                            rootLabel='my-app/'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { TreeView } from '@lockness/ui/components'

const projectStructure = [
    { id: 'app', label: 'app/', children: [
        { id: 'controller', label: 'controller/' },
        { id: 'model', label: 'model/' },
        { id: 'view', label: 'view/', children: [
            { id: 'components', label: 'components/' },
            { id: 'layouts', label: 'layouts/' },
        ]},
    ]},
    { id: 'main', label: 'main.ts' },
]

<TreeView
    items={projectStructure}
    variant="text"
    rootLabel="my-app/"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Icons',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <TreeView>
                            <TreeViewItem
                                label='Folders'
                                icon={<FolderIcon />}
                                hasChildren
                                defaultExpanded
                            >
                                <TreeViewItem
                                    label='src'
                                    icon={<FolderIcon />}
                                    hasChildren
                                >
                                    <TreeViewItem
                                        label='index.ts'
                                        icon={<FileIcon />}
                                    />
                                    <TreeViewItem
                                        label='app.tsx'
                                        icon={<ComponentIcon />}
                                    />
                                </TreeViewItem>
                                <TreeViewItem
                                    label='public'
                                    icon={<FolderIcon />}
                                />
                            </TreeViewItem>
                            <TreeViewItem
                                label='package.json'
                                icon={<FileIcon />}
                            />
                        </TreeView>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { TreeView, TreeViewItem } from '@lockness/ui/components'

const FolderIcon = () => (
  <svg>...</svg>
)

<TreeView>
  <TreeViewItem
    label="Folder"
    icon={<FolderIcon />}
    hasChildren
  >
    <TreeViewItem label="File.txt" />
  </TreeViewItem>
</TreeView>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Selectable Items',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <TreeView>
                            <TreeViewItem
                                label='Navigation'
                                hasChildren
                                defaultExpanded
                                selectable
                            >
                                <TreeViewItem
                                    label='Home'
                                    selectable
                                    defaultSelected
                                />
                                <TreeViewItem
                                    label='Products'
                                    hasChildren
                                    selectable
                                >
                                    <TreeViewItem
                                        label='Electronics'
                                        selectable
                                    />
                                    <TreeViewItem label='Clothing' selectable />
                                    <TreeViewItem label='Books' selectable />
                                </TreeViewItem>
                                <TreeViewItem label='About' selectable />
                                <TreeViewItem label='Contact' selectable />
                            </TreeViewItem>
                        </TreeView>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { TreeView, TreeViewItem } from '@lockness/ui/components'

<TreeView>
  <TreeViewItem
    label="Home"
    selectable
    defaultSelected
  />
  <TreeViewItem label="About" selectable />
  <TreeViewItem label="Contact" selectable />
</TreeView>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Keyboard Navigation',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ul class='space-y-2 text-sm'>
                            <li>
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    →
                                </kbd>{' '}
                                Expand branch / Move to first child
                            </li>
                            <li>
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    ←
                                </kbd>{' '}
                                Collapse branch / Move to parent
                            </li>
                            <li>
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    ↓
                                </kbd>{' '}
                                Move to next item
                            </li>
                            <li>
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    ↑
                                </kbd>{' '}
                                Move to previous item
                            </li>
                            <li>
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    Enter
                                </kbd>{' '}
                                /{' '}
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    Space
                                </kbd>{' '}
                                Select item (if selectable)
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable title='TreeView' props={treeViewProps} />
                <PropsTable title='TreeViewItem' props={treeViewItemProps} />
            </div>
        ),
    },
]
