/**
 * Table Component Demo Page
 * Demonstrates the Table component with various configurations
 */

import {
    Badge,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    CodeBlock,
    Input,
    Pagination,
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableEmpty,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

// Sample data for demos
const invoices = [
    { id: 'INV001', status: 'Paid', method: 'Credit Card', amount: '$250.00' },
    { id: 'INV002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
    {
        id: 'INV003',
        status: 'Unpaid',
        method: 'Bank Transfer',
        amount: '$350.00',
    },
    { id: 'INV004', status: 'Paid', method: 'Credit Card', amount: '$450.00' },
    { id: 'INV005', status: 'Paid', method: 'PayPal', amount: '$550.00' },
]

const payments = [
    { id: '728ed52f', status: 'success', email: 'm@example.com', amount: 100 },
    {
        id: '489e1d42',
        status: 'processing',
        email: 'user@gmail.com',
        amount: 125,
    },
    { id: 'a1b2c3d4', status: 'pending', email: 'test@test.com', amount: 200 },
    { id: 'e5f6g7h8', status: 'failed', email: 'fail@example.com', amount: 75 },
]

const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<
        string,
        'default' | 'secondary' | 'destructive' | 'outline'
    > = {
        success: 'default',
        Paid: 'default',
        processing: 'secondary',
        Pending: 'secondary',
        pending: 'outline',
        failed: 'destructive',
        Unpaid: 'destructive',
    }
    return <Badge variant={colors[status] || 'outline'}>{status}</Badge>
}

export const TablePage = () => {
    return (
        <PageUiLayout title='Table - Lockness UI' currentPath='/ui/table'>
            <div class='space-y-8'>
                {/* Header */}
                <div class='space-y-2'>
                    <h1 class='font-pixel text-3xl font-bold tracking-tight'>
                        Table
                    </h1>
                    <p class='text-(--muted-foreground)'>
                        A responsive table component for displaying tabular data
                        with support for sorting, clickable rows, and empty
                        states.
                    </p>
                </div>

                {/* Basic Example */}
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Table</CardTitle>
                        <CardDescription>
                            A simple table with header, body, footer, and
                            caption
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table>
                            <TableCaption>
                                A list of your recent invoices.
                            </TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead class='w-[100px]'>
                                        Invoice
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead class='text-right'>
                                        Amount
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell class='font-medium'>
                                            {invoice.id}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                status={invoice.status}
                                            />
                                        </TableCell>
                                        <TableCell>{invoice.method}</TableCell>
                                        <TableCell class='text-right'>
                                            {invoice.amount}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={3}>Total</TableCell>
                                    <TableCell class='text-right'>
                                        $1,750.00
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<Table>
  <TableCaption>A list of your recent invoices.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead class="w-[100px]">Invoice</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Method</TableHead>
      <TableHead class="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((invoice) => (
      <TableRow key={invoice.id}>
        <TableCell class="font-medium">{invoice.id}</TableCell>
        <TableCell>{invoice.status}</TableCell>
        <TableCell>{invoice.method}</TableCell>
        <TableCell class="text-right">{invoice.amount}</TableCell>
      </TableRow>
    ))}
  </TableBody>
  <TableFooter>
    <TableRow>
      <TableCell colSpan={3}>Total</TableCell>
      <TableCell class="text-right">$1,750.00</TableCell>
    </TableRow>
  </TableFooter>
</Table>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Clickable Rows */}
                <Card>
                    <CardHeader>
                        <CardTitle>Clickable Rows</CardTitle>
                        <CardDescription>
                            Use the href prop on TableRow to make rows
                            clickable. Navigation is handled with Unpoly.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead class='text-right'>
                                        Amount
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment) => (
                                    <TableRow
                                        key={payment.id}
                                        href={`#payment-${payment.id}`}
                                    >
                                        <TableCell class='font-mono text-sm'>
                                            {payment.id}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                status={payment.status}
                                            />
                                        </TableCell>
                                        <TableCell>{payment.email}</TableCell>
                                        <TableCell class='text-right'>
                                            ${payment.amount}.00
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<TableRow href={\`/payments/\${payment.id}\`}>
  <TableCell>{payment.id}</TableCell>
  <TableCell>{payment.status}</TableCell>
  <TableCell>{payment.email}</TableCell>
  <TableCell class="text-right">\${payment.amount}</TableCell>
</TableRow>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Striped Rows */}
                <Card>
                    <CardHeader>
                        <CardTitle>Striped Rows</CardTitle>
                        <CardDescription>
                            Add zebra-striping to table rows for better
                            readability.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table striped>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Age</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead class='text-right'>
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        John Brown
                                    </TableCell>
                                    <TableCell>45</TableCell>
                                    <TableCell>
                                        New York No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Jim Green
                                    </TableCell>
                                    <TableCell>27</TableCell>
                                    <TableCell>
                                        London No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Joe Black
                                    </TableCell>
                                    <TableCell>31</TableCell>
                                    <TableCell>
                                        Sidney No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Edward King
                                    </TableCell>
                                    <TableCell>16</TableCell>
                                    <TableCell>LA No. 1 Lake Park</TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<Table striped>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Age</TableHead>
      <TableHead>Address</TableHead>
      <TableHead class="text-right">Action</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Brown</TableCell>
      <TableCell>45</TableCell>
      <TableCell>New York No. 1 Lake Park</TableCell>
      <TableCell class="text-right">Delete</TableCell>
    </TableRow>
    {/* ... more rows */}
  </TableBody>
</Table>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Hoverable Rows */}
                <Card>
                    <CardHeader>
                        <CardTitle>Hoverable Rows</CardTitle>
                        <CardDescription>
                            Add hover effect to table rows for better
                            interactivity.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table hoverable>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Age</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead class='text-right'>
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        John Brown
                                    </TableCell>
                                    <TableCell>45</TableCell>
                                    <TableCell>
                                        New York No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Jim Green
                                    </TableCell>
                                    <TableCell>27</TableCell>
                                    <TableCell>
                                        London No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Joe Black
                                    </TableCell>
                                    <TableCell>31</TableCell>
                                    <TableCell>
                                        Sidney No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<Table hoverable>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Age</TableHead>
      <TableHead>Address</TableHead>
      <TableHead class="text-right">Action</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Brown</TableCell>
      <TableCell>45</TableCell>
      <TableCell>New York No. 1 Lake Park</TableCell>
      <TableCell class="text-right">Delete</TableCell>
    </TableRow>
    {/* ... more rows */}
  </TableBody>
</Table>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Bordered Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Bordered Table</CardTitle>
                        <CardDescription>
                            Add borders on all sides of the table and cells.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table bordered>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Age</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead class='text-right'>
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        John Brown
                                    </TableCell>
                                    <TableCell>45</TableCell>
                                    <TableCell>
                                        New York No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Jim Green
                                    </TableCell>
                                    <TableCell>27</TableCell>
                                    <TableCell>
                                        London No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell class='font-medium'>
                                        Joe Black
                                    </TableCell>
                                    <TableCell>31</TableCell>
                                    <TableCell>
                                        Sidney No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<Table bordered>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Age</TableHead>
      <TableHead>Address</TableHead>
      <TableHead class="text-right">Action</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Brown</TableCell>
      <TableCell>45</TableCell>
      <TableCell>New York No. 1 Lake Park</TableCell>
      <TableCell class="text-right">Delete</TableCell>
    </TableRow>
    {/* ... more rows */}
  </TableBody>
</Table>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Selection Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Selection</CardTitle>
                        <CardDescription>
                            Rows can be selectable by adding checkboxes as the
                            first column.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table bordered>
                            <TableHeader>
                                <TableRow>
                                    <TableHead class='w-12'>
                                        <div class='flex items-center justify-center'>
                                            <Checkbox id='select-all' />
                                        </div>
                                    </TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Age</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead class='text-right'>
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>
                                        <div class='flex items-center justify-center'>
                                            <Checkbox id='select-1' />
                                        </div>
                                    </TableCell>
                                    <TableCell class='font-medium'>
                                        John Brown
                                    </TableCell>
                                    <TableCell>45</TableCell>
                                    <TableCell>
                                        New York No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>
                                        <div class='flex items-center justify-center'>
                                            <Checkbox id='select-2' />
                                        </div>
                                    </TableCell>
                                    <TableCell class='font-medium'>
                                        Jim Green
                                    </TableCell>
                                    <TableCell>27</TableCell>
                                    <TableCell>
                                        London No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>
                                        <div class='flex items-center justify-center'>
                                            <Checkbox id='select-3' />
                                        </div>
                                    </TableCell>
                                    <TableCell class='font-medium'>
                                        Joe Black
                                    </TableCell>
                                    <TableCell>31</TableCell>
                                    <TableCell>
                                        Sidney No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>
                                        <div class='flex items-center justify-center'>
                                            <Checkbox id='select-4' />
                                        </div>
                                    </TableCell>
                                    <TableCell class='font-medium'>
                                        Edward King
                                    </TableCell>
                                    <TableCell>16</TableCell>
                                    <TableCell>LA No. 1 Lake Park</TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>
                                        <div class='flex items-center justify-center'>
                                            <Checkbox id='select-5' />
                                        </div>
                                    </TableCell>
                                    <TableCell class='font-medium'>
                                        Jim Red
                                    </TableCell>
                                    <TableCell>45</TableCell>
                                    <TableCell>
                                        Melbourne No. 1 Lake Park
                                    </TableCell>
                                    <TableCell class='text-right'>
                                        <button
                                            type='button'
                                            class='text-sm font-semibold text-primary hover:text-primary/80'
                                        >
                                            Delete
                                        </button>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<Table bordered>
  <TableHeader>
    <TableRow>
      <TableHead class="w-12">
        <div class="flex items-center justify-center">
          <Checkbox id="select-all" />
        </div>
      </TableHead>
      <TableHead>Name</TableHead>
      <TableHead>Age</TableHead>
      <TableHead>Address</TableHead>
      <TableHead class="text-right">Action</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>
        <div class="flex items-center justify-center">
          <Checkbox id="select-1" />
        </div>
      </TableCell>
      <TableCell>John Brown</TableCell>
      <TableCell>45</TableCell>
      <TableCell>New York No. 1 Lake Park</TableCell>
      <TableCell class="text-right">Delete</TableCell>
    </TableRow>
    {/* ... more rows */}
  </TableBody>
</Table>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Search Input */}
                <Card>
                    <CardHeader>
                        <CardTitle>Search Input</CardTitle>
                        <CardDescription>
                            Add a search input to filter table rows. Uses Unpoly
                            for server-side filtering.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <div class='border border-border rounded-(--radius) divide-y divide-border'>
                            <div class='py-3 px-4'>
                                <form
                                    up-target='#search-table-results'
                                    up-autosubmit
                                    up-delay='300'
                                    class='relative max-w-xs'
                                >
                                    <label
                                        for='table-search'
                                        class='sr-only'
                                    >
                                        Search
                                    </label>
                                    <Input
                                        type='text'
                                        name='q'
                                        id='table-search'
                                        placeholder='Search for items'
                                        class='ps-9'
                                    />
                                    <div class='absolute inset-y-0 start-0 flex items-center pointer-events-none ps-3'>
                                        <svg
                                            class='size-4 text-muted-foreground'
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
                                            <circle cx='11' cy='11' r='8' />
                                            <path d='m21 21-4.3-4.3' />
                                        </svg>
                                    </div>
                                </form>
                            </div>
                            <div id='search-table-results'>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead class='w-12'>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='search-select-all' />
                                                </div>
                                            </TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Age</TableHead>
                                            <TableHead>Address</TableHead>
                                            <TableHead class='text-right'>
                                                Action
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='search-1' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                John Brown
                                            </TableCell>
                                            <TableCell>45</TableCell>
                                            <TableCell>
                                                New York No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='search-2' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                Jim Green
                                            </TableCell>
                                            <TableCell>27</TableCell>
                                            <TableCell>
                                                London No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='search-3' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                Joe Black
                                            </TableCell>
                                            <TableCell>31</TableCell>
                                            <TableCell>
                                                Sidney No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <CodeBlock lang='tsx'>
                            {`<div class="border border-border rounded-(--radius) divide-y divide-border">
  <div class="py-3 px-4">
    <form up-target="#search-results" up-autosubmit up-delay="300" class="relative max-w-xs">
      <label for="table-search" class="sr-only">Search</label>
      <Input
        type="text"
        name="q"
        id="table-search"
        placeholder="Search for items"
        class="ps-9"
      />
      <div class="absolute inset-y-0 start-0 flex items-center pointer-events-none ps-3">
        <SearchIcon class="size-4 text-muted-foreground" />
      </div>
    </form>
  </div>
  <div id="search-results">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Age</TableHead>
          <TableHead>Address</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredData.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.age}</TableCell>
            <TableCell>{item.address}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
</div>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* With Pagination */}
                <Card>
                    <CardHeader>
                        <CardTitle>With Pagination</CardTitle>
                        <CardDescription>
                            Table with search and pagination controls.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <div class='border border-border rounded-(--radius) divide-y divide-border'>
                            <div class='py-3 px-4'>
                                <form
                                    up-target='#pagination-table-results'
                                    up-autosubmit
                                    up-delay='300'
                                    class='relative max-w-xs'
                                >
                                    <label
                                        for='pagination-search'
                                        class='sr-only'
                                    >
                                        Search
                                    </label>
                                    <Input
                                        type='text'
                                        name='q'
                                        id='pagination-search'
                                        placeholder='Search for items'
                                        class='ps-9'
                                    />
                                    <div class='absolute inset-y-0 start-0 flex items-center pointer-events-none ps-3'>
                                        <svg
                                            class='size-4 text-muted-foreground'
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
                                            <circle cx='11' cy='11' r='8' />
                                            <path d='m21 21-4.3-4.3' />
                                        </svg>
                                    </div>
                                </form>
                            </div>
                            <div id='pagination-table-results'>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead class='w-12'>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='page-select-all' />
                                                </div>
                                            </TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Age</TableHead>
                                            <TableHead>Address</TableHead>
                                            <TableHead class='text-right'>
                                                Action
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='page-1' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                John Brown
                                            </TableCell>
                                            <TableCell>45</TableCell>
                                            <TableCell>
                                                New York No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='page-2' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                Jim Green
                                            </TableCell>
                                            <TableCell>27</TableCell>
                                            <TableCell>
                                                London No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='page-3' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                Joe Black
                                            </TableCell>
                                            <TableCell>31</TableCell>
                                            <TableCell>
                                                Sidney No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='page-4' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                Edward King
                                            </TableCell>
                                            <TableCell>16</TableCell>
                                            <TableCell>
                                                LA No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>
                                                <div class='flex items-center justify-center'>
                                                    <Checkbox id='page-5' />
                                                </div>
                                            </TableCell>
                                            <TableCell class='font-medium'>
                                                Jim Red
                                            </TableCell>
                                            <TableCell>45</TableCell>
                                            <TableCell>
                                                Melbourne No. 1 Lake Park
                                            </TableCell>
                                            <TableCell class='text-right'>
                                                <button
                                                    type='button'
                                                    class='text-sm font-semibold text-primary hover:text-primary/80'
                                                >
                                                    Delete
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                            <div class='py-2 px-4'>
                                <Pagination
                                    currentPage={1}
                                    totalPages={3}
                                    baseUrl='#'
                                />
                            </div>
                        </div>

                        <CodeBlock lang='tsx'>
                            {`<div class="border border-border rounded-(--radius) divide-y divide-border">
  {/* Search */}
  <div class="py-3 px-4">
    <form up-target="#table-results" up-autosubmit up-delay="300" class="relative max-w-xs">
      <Input type="text" name="q" placeholder="Search for items" class="ps-9" />
      <div class="absolute inset-y-0 start-0 flex items-center pointer-events-none ps-3">
        <SearchIcon class="size-4 text-muted-foreground" />
      </div>
    </form>
  </div>

  {/* Table */}
  <div id="table-results">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-12">
            <Checkbox id="select-all" />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Age</TableHead>
          <TableHead>Address</TableHead>
          <TableHead class="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id}>
            <TableCell><Checkbox id={item.id} /></TableCell>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.age}</TableCell>
            <TableCell>{item.address}</TableCell>
            <TableCell class="text-right">Delete</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>

  {/* Pagination */}
  <div class="py-2 px-4">
    <Pagination currentPage={1} totalPages={10} baseUrl="/users" />
  </div>
</div>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Sortable Headers */}
                <Card>
                    <CardHeader>
                        <CardTitle>Sortable Headers</CardTitle>
                        <CardDescription>
                            Use sortable, sortDirection, and sortHref props for
                            server-side sorting with Unpoly.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        sortable
                                        sortDirection='asc'
                                        sortHref='#sort=id&dir=desc'
                                    >
                                        ID
                                    </TableHead>
                                    <TableHead
                                        sortable
                                        sortDirection={null}
                                        sortHref='#sort=email&dir=asc'
                                    >
                                        Email
                                    </TableHead>
                                    <TableHead
                                        sortable
                                        sortDirection='desc'
                                        sortHref='#sort=amount&dir=asc'
                                    >
                                        Amount
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.slice(0, 3).map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell class='font-mono text-sm'>
                                            {payment.id}
                                        </TableCell>
                                        <TableCell>{payment.email}</TableCell>
                                        <TableCell>
                                            ${payment.amount}.00
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<TableHead 
  sortable 
  sortDirection="asc" 
  sortHref="?sort=id&dir=desc"
>
  ID
</TableHead>

<TableHead 
  sortable 
  sortDirection={null}  // unsorted
  sortHref="?sort=email&dir=asc"
>
  Email
</TableHead>

<TableHead 
  sortable 
  sortDirection="desc" 
  sortHref="?sort=amount&dir=asc"
>
  Amount
</TableHead>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Empty State */}
                <Card>
                    <CardHeader>
                        <CardTitle>Empty State</CardTitle>
                        <CardDescription>
                            Use TableEmpty component when there's no data to
                            display.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead class='text-right'>
                                        Amount
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableEmpty colSpan={4}>
                                    No invoices found.
                                </TableEmpty>
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<TableBody>
  {data.length ? (
    data.map((item) => (
      <TableRow key={item.id}>
        {/* ... */}
      </TableRow>
    ))
  ) : (
    <TableEmpty colSpan={4}>No invoices found.</TableEmpty>
  )}
</TableBody>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Selected Rows */}
                <Card>
                    <CardHeader>
                        <CardTitle>Selected Rows</CardTitle>
                        <CardDescription>
                            Use the selected prop to highlight selected rows.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead class='text-right'>
                                        Amount
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment, i) => (
                                    <TableRow
                                        key={payment.id}
                                        selected={i === 1}
                                    >
                                        <TableCell class='font-mono text-sm'>
                                            {payment.id}
                                        </TableCell>
                                        <TableCell>{payment.email}</TableCell>
                                        <TableCell class='text-right'>
                                            ${payment.amount}.00
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <CodeBlock lang='tsx'>
                            {`<TableRow selected={isSelected}>
  <TableCell>{payment.id}</TableCell>
  <TableCell>{payment.email}</TableCell>
  <TableCell class="text-right">\${payment.amount}</TableCell>
</TableRow>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Props Documentation */}
                <Card>
                    <CardHeader>
                        <CardTitle>Component API</CardTitle>
                        <CardDescription>
                            Props and configuration options
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <div>
                            <h3 class='font-semibold mb-2'>TableRow Props</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Prop</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            selected
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            boolean
                                        </TableCell>
                                        <TableCell>
                                            Highlights the row as selected
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            href
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            string
                                        </TableCell>
                                        <TableCell>
                                            Makes the row clickable, navigates
                                            with Unpoly
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        <div>
                            <h3 class='font-semibold mb-2'>TableHead Props</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Prop</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            sortable
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            boolean
                                        </TableCell>
                                        <TableCell>
                                            Enables sorting UI
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            sortDirection
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            'asc' | 'desc' | null
                                        </TableCell>
                                        <TableCell>
                                            Current sort direction
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            sortHref
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            string
                                        </TableCell>
                                        <TableCell>
                                            URL for server-side sorting
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        <div>
                            <h3 class='font-semibold mb-2'>TableCell Props</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Prop</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            colSpan
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            number
                                        </TableCell>
                                        <TableCell>
                                            Number of columns to span
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            rowSpan
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            number
                                        </TableCell>
                                        <TableCell>
                                            Number of rows to span
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        <div>
                            <h3 class='font-semibold mb-2'>TableEmpty Props</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Prop</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            colSpan
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            number
                                        </TableCell>
                                        <TableCell>
                                            Number of columns to span (required
                                            for proper centering)
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell class='font-mono'>
                                            children
                                        </TableCell>
                                        <TableCell class='font-mono text-muted-foreground'>
                                            ReactNode
                                        </TableCell>
                                        <TableCell>
                                            Custom empty message (default: "No
                                            results.")
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Features */}
                <Card>
                    <CardHeader>
                        <CardTitle>Features</CardTitle>
                        <CardDescription>
                            Key capabilities of the Table component
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul class='space-y-2 text-(--muted-foreground)'>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Theme-aware:</strong>{' '}
                                    Uses CSS variables for consistent theming
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Responsive:</strong>{' '}
                                    Horizontal scrolling on small screens
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Sortable headers:</strong>{' '}
                                    Server-side sorting with Unpoly integration
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Clickable rows:</strong>{' '}
                                    Navigate to detail pages with href prop
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Selection state:</strong>{' '}
                                    Visual feedback for selected rows
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Empty state:</strong>{' '}
                                    Built-in TableEmpty component
                                </span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>

                {/* Installation */}
                <Card>
                    <CardHeader>
                        <CardTitle>Installation</CardTitle>
                        <CardDescription>
                            Import from @lockness/ui/components
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CodeBlock lang='tsx'>
                            {`import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@lockness/ui/components'`}
                        </CodeBlock>
                    </CardContent>
                </Card>
            </div>
        </PageUiLayout>
    )
}
