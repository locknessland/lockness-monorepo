import type { FC } from '@lockness/core'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import {
    AreaChart,
    BarChart,
    Card,
    CardContent,
    ChartLegend,
    ChartScript,
    CodeBlock,
    LineChart,
} from '@lockness/ui/components'

export const ChartPage: FC = () => {
    // Sample data
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
    const singleData = [65, 59, 80, 81, 56, 55, 72]

    const incomeData = [65, 59, 80, 81, 56, 55, 72]
    const outcomeData = [28, 48, 40, 19, 86, 27, 50]

    return (
        <PageUiLayout title='Chart - Lockness UI'>
            <ChartScript />
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        CHART
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Area chart components using Chart.js via CDN. Supports
                        single area, multiple area, and curved area charts.
                    </p>
                </header>

                {/* Installation */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INSTALLATION
                    </h2>
                    <p class='text-muted-foreground'>
                        Include the ChartScript component once in your layout or
                        page to load Chart.js from CDN.
                    </p>
                    <CodeBlock lang='tsx'>
                        {`import { ChartScript } from '@lockness/ui/components'

// In your layout or page
<ChartScript />`}
                    </CodeBlock>
                </section>

                {/* Single Area Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SINGLE AREA CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A simple area chart with a single dataset.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <AreaChart
                                chartId='single-area-chart'
                                labels={labels}
                                data={singleData}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { AreaChart } from '@lockness/ui/components'

<AreaChart
  chartId="single-area-chart"
  labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
  data={[65, 59, 80, 81, 56, 55, 72]}
/>`}
                    </CodeBlock>
                </section>

                {/* Multiple Area Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        MULTIPLE AREA CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        An area chart with multiple datasets. Use ChartLegend to
                        display a legend.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <ChartLegend
                                items={[
                                    {
                                        label: 'Income',
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        label: 'Outcome',
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                            <AreaChart
                                chartId='multiple-area-chart'
                                labels={labels}
                                datasets={[
                                    {
                                        name: 'Income',
                                        data: incomeData,
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        name: 'Outcome',
                                        data: outcomeData,
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { AreaChart, ChartLegend } from '@lockness/ui/components'

<ChartLegend
  items={[
    { label: 'Income', color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', color: 'rgb(147, 51, 234)' },
  ]}
/>
<AreaChart
  chartId="multiple-area-chart"
  labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
  datasets={[
    { name: 'Income', data: [65, 59, 80, 81, 56, 55, 72], color: 'rgb(59, 130, 246)' },
    { name: 'Outcome', data: [28, 48, 40, 19, 86, 27, 50], color: 'rgb(147, 51, 234)' },
  ]}
/>`}
                    </CodeBlock>
                </section>

                {/* Compare Tooltip */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COMPARE TOOLTIP
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the compareTooltip prop to show both values in a
                        single tooltip when hovering.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <ChartLegend
                                items={[
                                    {
                                        label: 'Income',
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        label: 'Outcome',
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                            <AreaChart
                                chartId='compare-tooltip-chart'
                                labels={labels}
                                datasets={[
                                    {
                                        name: 'Income',
                                        data: incomeData,
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        name: 'Outcome',
                                        data: outcomeData,
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                                compareTooltip
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<AreaChart
  chartId="compare-tooltip-chart"
  labels={labels}
  datasets={datasets}
  compareTooltip
/>`}
                    </CodeBlock>
                </section>

                {/* Curved Area Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CURVED AREA CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the curved prop to create smooth, curved lines
                        instead of straight segments.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <ChartLegend
                                items={[
                                    {
                                        label: 'Income',
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        label: 'Outcome',
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                            <AreaChart
                                chartId='curved-area-chart'
                                labels={labels}
                                datasets={[
                                    {
                                        name: 'Income',
                                        data: incomeData,
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        name: 'Outcome',
                                        data: outcomeData,
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                                curved
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<AreaChart
  chartId="curved-area-chart"
  labels={labels}
  datasets={datasets}
  curved
/>`}
                    </CodeBlock>
                </section>

                {/* Custom Colors */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM COLORS
                    </h2>
                    <p class='text-muted-foreground'>
                        Customize the chart colors using the color and fillColor
                        props.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <AreaChart
                                chartId='custom-color-chart'
                                labels={labels}
                                data={singleData}
                                color='rgb(34, 197, 94)'
                                fillColor='rgba(34, 197, 94, 0.15)'
                                curved
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<AreaChart
  chartId="custom-color-chart"
  labels={labels}
  data={data}
  color="rgb(34, 197, 94)"
  fillColor="rgba(34, 197, 94, 0.15)"
  curved
/>`}
                    </CodeBlock>
                </section>

                {/* Single Bar Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SINGLE BAR CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A simple bar chart with a single dataset.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <BarChart
                                chartId='single-bar-chart'
                                labels={labels}
                                data={singleData}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { BarChart } from '@lockness/ui/components'

<BarChart
  chartId="single-bar-chart"
  labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
  data={[65, 59, 80, 81, 56, 55, 72]}
/>`}
                    </CodeBlock>
                </section>

                {/* Multiple Bar Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        MULTIPLE BAR CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A bar chart with multiple datasets displayed side by
                        side.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <ChartLegend
                                items={[
                                    {
                                        label: 'Income',
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        label: 'Outcome',
                                        color: 'rgb(209, 213, 219)',
                                    },
                                ]}
                            />
                            <BarChart
                                chartId='multiple-bar-chart'
                                labels={labels}
                                datasets={[
                                    {
                                        name: 'Income',
                                        data: incomeData,
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        name: 'Outcome',
                                        data: outcomeData,
                                        color: 'rgb(209, 213, 219)',
                                    },
                                ]}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<ChartLegend
  items={[
    { label: 'Income', color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', color: 'rgb(209, 213, 219)' },
  ]}
/>
<BarChart
  chartId="multiple-bar-chart"
  labels={labels}
  datasets={[
    { name: 'Income', data: incomeData, color: 'rgb(59, 130, 246)' },
    { name: 'Outcome', data: outcomeData, color: 'rgb(209, 213, 219)' },
  ]}
/>`}
                    </CodeBlock>
                </section>

                {/* Horizontal Bar Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        HORIZONTAL BAR CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the horizontal prop to display bars horizontally.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <BarChart
                                chartId='horizontal-bar-chart'
                                labels={[
                                    'Product A',
                                    'Product B',
                                    'Product C',
                                    'Product D',
                                    'Product E',
                                ]}
                                data={[85, 72, 96, 54, 68]}
                                horizontal
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<BarChart
  chartId="horizontal-bar-chart"
  labels={['Product A', 'Product B', 'Product C', 'Product D', 'Product E']}
  data={[85, 72, 96, 54, 68]}
  horizontal
/>`}
                    </CodeBlock>
                </section>

                {/* Single Line Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SINGLE LINE CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A simple line chart without fill (unlike AreaChart).
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <LineChart
                                chartId='single-line-chart'
                                labels={labels}
                                data={singleData}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { LineChart } from '@lockness/ui/components'

<LineChart
  chartId="single-line-chart"
  labels={labels}
  data={data}
/>`}
                    </CodeBlock>
                </section>

                {/* Multiple Line Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        MULTIPLE LINE CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A line chart with multiple datasets.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <ChartLegend
                                items={[
                                    {
                                        label: 'Income',
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        label: 'Outcome',
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                            <LineChart
                                chartId='multiple-line-chart'
                                labels={labels}
                                datasets={[
                                    {
                                        name: 'Income',
                                        data: incomeData,
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        name: 'Outcome',
                                        data: outcomeData,
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<ChartLegend
  items={[
    { label: 'Income', color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', color: 'rgb(147, 51, 234)' },
  ]}
/>
<LineChart
  chartId="multiple-line-chart"
  labels={labels}
  datasets={[
    { name: 'Income', data: incomeData, color: 'rgb(59, 130, 246)' },
    { name: 'Outcome', data: outcomeData, color: 'rgb(147, 51, 234)' },
  ]}
/>`}
                    </CodeBlock>
                </section>

                {/* Curved Line Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CURVED LINE CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the curved prop for smooth, curved lines.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <ChartLegend
                                items={[
                                    {
                                        label: 'Income',
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        label: 'Outcome',
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                            />
                            <LineChart
                                chartId='curved-line-chart'
                                labels={labels}
                                datasets={[
                                    {
                                        name: 'Income',
                                        data: incomeData,
                                        color: 'rgb(59, 130, 246)',
                                    },
                                    {
                                        name: 'Outcome',
                                        data: outcomeData,
                                        color: 'rgb(147, 51, 234)',
                                    },
                                ]}
                                curved
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<LineChart
  chartId="curved-line-chart"
  labels={labels}
  datasets={datasets}
  curved
/>`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>

                    <h3 class='font-pixel text-xs text-foreground'>
                        AreaChart Props
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
                                        chartId
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Unique ID for Chart.js initialization
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        labels
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        X-axis labels
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Single dataset values
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        datasets
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        ChartDataset[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Multiple datasets
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        color
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'rgb(59, 130, 246)'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Line color for single dataset
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fillColor
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'rgba(59, 130, 246, 0.1)'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Fill color for single dataset
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        curved
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Use curved/smooth lines
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        compareTooltip
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show all values in tooltip
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        height
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        '300px'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Chart height
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        ChartDataset
                    </h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Property
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Type
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='divide-y'>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        name
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Dataset label
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Data values
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        color
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Line color (rgb format)
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        fillColor
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Optional fill color (rgba format)
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        BarChart Props
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
                                        chartId
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Unique ID for Chart.js initialization
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        labels
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Chart labels
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Single dataset values
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        datasets
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        ChartDataset[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Multiple datasets
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        horizontal
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Display bars horizontally
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        borderRadius
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        4
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Bar corner radius
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        LineChart Props
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
                                        chartId
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Unique ID for Chart.js initialization
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        labels
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        X-axis labels
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Single dataset values
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        datasets
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        ChartDataset[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Multiple datasets
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        curved
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Use curved/smooth lines
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        compareTooltip
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show all values in tooltip
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        ChartLegend Props
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
                                        items
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        ChartLegendItemProps[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Legend items with label and color
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        position
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'start' | 'center' | 'end'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'end'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Legend position
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
                                    Charts use canvas elements with proper
                                    sizing
                                </li>
                                <li>
                                    Legend provides text labels for color-coded
                                    data
                                </li>
                                <li>
                                    Tooltips show detailed information on hover
                                </li>
                                <li>
                                    Consider providing data tables as
                                    alternatives for screen readers
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
