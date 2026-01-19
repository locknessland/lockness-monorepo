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
    CodeBlock,
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
        <PageUiLayout title='Table - Lockness UI'>
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
