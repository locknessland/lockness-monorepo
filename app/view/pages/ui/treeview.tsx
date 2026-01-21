import { TreeView, TreeViewItem } from '@lockness/ui/components'
import type { TreeViewDataItem } from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

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
                    {
                        id: 'card',
                        label: 'Card.tsx',
                        icon: <ComponentIcon />,
                    },
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
                    {
                        id: 'cn',
                        label: 'cn.ts',
                        icon: <FileIcon />,
                    },
                    {
                        id: 'format',
                        label: 'format.ts',
                        icon: <FileIcon />,
                    },
                ],
            },
        ],
    },
    {
        id: 'public',
        label: 'public',
        icon: <FolderIcon />,
        children: [
            {
                id: 'favicon',
                label: 'favicon.ico',
                icon: <FileIcon />,
            },
            {
                id: 'robots',
                label: 'robots.txt',
                icon: <FileIcon />,
            },
        ],
    },
    {
        id: 'package',
        label: 'package.json',
        icon: <FileIcon />,
    },
]

export const TreeViewPage = () => {
    return (
        <PageUiLayout title='TreeView - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        TREEVIEW
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Hierarchical tree structure with expand/collapse and
                        keyboard navigation
                    </p>
                </header>

                {/* Basic Tree Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC TREE
                    </h2>
                    <div class='border border-(--border) rounded-lg p-4 bg-card'>
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
                    </div>
                </section>

                {/* Data-Driven Tree Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        FILE SYSTEM TREE (DATA-DRIVEN)
                    </h2>
                    <div class='border border-(--border) rounded-lg p-4 bg-card'>
                        <TreeView items={fileSystemData} />
                    </div>
                </section>

                {/* Text Variant (ASCII Tree) */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TEXT VARIANT (ASCII TREE)
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Static ASCII representation, perfect for documentation
                        or code examples.
                    </p>
                    <div class='border border-(--border) rounded-lg p-4 bg-card'>
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
                    </div>
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
                </section>

                {/* Custom Icons Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM ICONS
                    </h2>
                    <div class='border border-(--border) rounded-lg p-4 bg-card'>
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
                                >
                                </TreeViewItem>
                            </TreeViewItem>
                            <TreeViewItem
                                label='package.json'
                                icon={<FileIcon />}
                            />
                        </TreeView>
                    </div>
                </section>

                {/* Selectable Items Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SELECTABLE ITEMS
                    </h2>
                    <div class='border border-(--border) rounded-lg p-4 bg-card'>
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
                    </div>
                </section>

                {/* Usage - Declarative */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        USAGE - DECLARATIVE API
                    </h2>
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
                </section>

                {/* Usage - Data-Driven */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        USAGE - DATA-DRIVEN API
                    </h2>
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
                </section>

                {/* Usage - Custom Icons */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM ICONS
                    </h2>
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
                </section>

                {/* Usage - Selectable */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SELECTABLE ITEMS
                    </h2>
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
                </section>

                {/* Keyboard Navigation */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        KEYBOARD NAVIGATION
                    </h2>
                    <div class='border border-(--border) rounded-lg p-4 bg-card'>
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
                                /
                                <kbd class='px-2 py-1 bg-muted rounded text-xs'>
                                    Space
                                </kbd>{' '}
                                Select item (if selectable)
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Features */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        FEATURES
                    </h2>
                    <div class='grid gap-4 md:grid-cols-2'>
                        <div class='border border-(--border) rounded-lg p-4 bg-card'>
                            <h3 class='font-semibold mb-2'>Accessible</h3>
                            <p class='text-sm text-muted-foreground'>
                                Full ARIA support with role="tree",
                                role="treeitem", aria-expanded, and
                                aria-selected
                            </p>
                        </div>
                        <div class='border border-(--border) rounded-lg p-4 bg-card'>
                            <h3 class='font-semibold mb-2'>
                                Keyboard Navigation
                            </h3>
                            <p class='text-sm text-muted-foreground'>
                                Arrow keys for navigation, Enter/Space for
                                selection
                            </p>
                        </div>
                        <div class='border border-(--border) rounded-lg p-4 bg-card'>
                            <h3 class='font-semibold mb-2'>Flexible APIs</h3>
                            <p class='text-sm text-muted-foreground'>
                                Both declarative (JSX) and data-driven (items
                                prop) approaches supported
                            </p>
                        </div>
                        <div class='border border-(--border) rounded-lg p-4 bg-card'>
                            <h3 class='font-semibold mb-2'>Customizable</h3>
                            <p class='text-sm text-muted-foreground'>
                                Custom icons, CSS classes, and full Tailwind CSS
                                integration
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </PageUiLayout>
    )
}
