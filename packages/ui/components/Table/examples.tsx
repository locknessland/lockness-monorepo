/**
 * @fileoverview Live examples for Table component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Badge } from '../Badge/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableEmpty,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

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

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Table'),
    {
        title: 'Basic Table',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Table>
                            <TableCaption>
                                A list of your recent invoices.
                            </TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead class='w-25'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Table>
  <TableCaption>A list of your recent invoices.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead class="w-25">Invoice</TableHead>
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
            </div>
        ),
    },
    {
        title: 'Clickable Rows',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<TableRow href={\`/payments/\${payment.id}\`}>
  <TableCell>{payment.id}</TableCell>
  <TableCell>{payment.status}</TableCell>
  <TableCell>{payment.email}</TableCell>
  <TableCell class="text-right">\${payment.amount}</TableCell>
</TableRow>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Rows',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Table striped>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Age</TableHead>
      <TableHead>Address</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Brown</TableCell>
      <TableCell>45</TableCell>
      <TableCell>New York No. 1 Lake Park</TableCell>
    </TableRow>
  </TableBody>
</Table>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Sortable Headers',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
    {
        title: 'Empty State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
    {
        title: 'Selected Rows',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<TableRow selected={isSelected}>
  <TableCell>{payment.id}</TableCell>
  <TableCell>{payment.email}</TableCell>
  <TableCell class="text-right">\${payment.amount}</TableCell>
</TableRow>`}
                </CodeBlock>
            </div>
        ),
    },
]
