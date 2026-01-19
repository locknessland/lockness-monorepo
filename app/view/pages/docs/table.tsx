import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import {
    Badge,
    CodeBlock,
    InlineCode,
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

export const TableDocsPage = (props: { currentPath?: string }) => {
    return (
        <DocsLayout
            title='Table Component'
            currentPath={props.currentPath ?? '/docs/table'}
            llmPath='table'
        >
            <div class='space-y-12'>
                {/* Introduction */}
                <section class='space-y-4'>
                    <p class='text-lg text-muted-foreground'>
                        A responsive table component for displaying tabular data
                        with support for sorting, clickable rows, and empty
                        states.
                    </p>
                </section>

                {/* Basic Example */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>Basic Table</h2>
                    <p class='text-muted-foreground'>
                        A simple table with header, body, and footer.
                    </p>

                    <div class='rounded-lg border'>
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
                    </div>

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
                </section>

                {/* Clickable Rows */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>Clickable Rows</h2>
                    <p class='text-muted-foreground'>
                        Use the <InlineCode>href</InlineCode> prop on{' '}
                        <InlineCode>TableRow</InlineCode>{' '}
                        to make rows clickable. Navigation is handled with
                        Unpoly for smooth page transitions.
                    </p>

                    <div class='rounded-lg border'>
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
                    </div>

                    <CodeBlock lang='tsx'>
                        {`<TableRow href={\`/payments/\${payment.id}\`}>
  <TableCell>{payment.id}</TableCell>
  <TableCell>{payment.status}</TableCell>
  <TableCell>{payment.email}</TableCell>
  <TableCell class="text-right">\${payment.amount}</TableCell>
</TableRow>`}
                    </CodeBlock>
                </section>

                {/* Sortable Headers */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>Sortable Headers</h2>
                    <p class='text-muted-foreground'>
                        Use <InlineCode>sortable</InlineCode>,{' '}
                        <InlineCode>sortDirection</InlineCode>, and{' '}
                        <InlineCode>sortHref</InlineCode>{' '}
                        props for server-side sorting with Unpoly.
                    </p>

                    <div class='rounded-lg border'>
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
                    </div>

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
</TableHead>`}
                    </CodeBlock>
                </section>

                {/* Empty State */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>Empty State</h2>
                    <p class='text-muted-foreground'>
                        Use <InlineCode>TableEmpty</InlineCode>{' '}
                        component when there's no data to display.
                    </p>

                    <div class='rounded-lg border'>
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
                    </div>

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
                </section>

                {/* Selected Rows */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>Selected Rows</h2>
                    <p class='text-muted-foreground'>
                        Use the <InlineCode>selected</InlineCode>{' '}
                        prop to highlight selected rows.
                    </p>

                    <div class='rounded-lg border'>
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
                    </div>

                    <CodeBlock lang='tsx'>
                        {`<TableRow selected={isSelected}>
  <TableCell>{payment.id}</TableCell>
  <TableCell>{payment.email}</TableCell>
  <TableCell class="text-right">\${payment.amount}</TableCell>
</TableRow>`}
                    </CodeBlock>
                </section>

                {/* API Reference */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>API Reference</h2>

                    <div class='space-y-6'>
                        <div>
                            <h3 class='text-lg font-semibold mb-2'>Table</h3>
                            <p class='text-muted-foreground mb-2'>
                                Wrapper component with responsive horizontal
                                scrolling.
                            </p>
                        </div>

                        <div>
                            <h3 class='text-lg font-semibold mb-2'>TableRow</h3>
                            <div class='rounded-lg border'>
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
                                                Makes the row clickable,
                                                navigates with Unpoly
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div>
                            <h3 class='text-lg font-semibold mb-2'>
                                TableHead
                            </h3>
                            <div class='rounded-lg border'>
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
                        </div>

                        <div>
                            <h3 class='text-lg font-semibold mb-2'>
                                TableCell
                            </h3>
                            <div class='rounded-lg border'>
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
                        </div>

                        <div>
                            <h3 class='text-lg font-semibold mb-2'>
                                TableEmpty
                            </h3>
                            <div class='rounded-lg border'>
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
                                                (required for proper centering)
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
                                                Custom empty message (default:
                                                "No results.")
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Installation */}
                <section class='space-y-4'>
                    <h2 class='text-2xl font-bold'>Installation</h2>
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
                </section>
            </div>
        </DocsLayout>
    )
}
