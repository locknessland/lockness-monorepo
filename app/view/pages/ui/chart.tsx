import type { FC } from '@lockness/core'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import {
    AreaChart,
    BarChart,
    BubbleChart,
    Card,
    CardContent,
    ChartLegend,
    ChartScript,
    CodeBlock,
    LineChart,
    PieChart,
    Sparkline,
    SparklinePie,
} from '@lockness/ui/components'

export const ChartPage: FC = () => {
    // Sample data
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
    const singleData = [65, 59, 80, 81, 56, 55, 72]

    const incomeData = [65, 59, 80, 81, 56, 55, 72]
    const outcomeData = [28, 48, 40, 19, 86, 27, 50]

    const pieData = [
        { label: 'Income', value: 50, color: 'rgb(59, 130, 246)' },
        { label: 'Outcome', value: 30, color: 'rgb(6, 182, 212)' },
        { label: 'Others', value: 20, color: 'rgb(209, 213, 219)' },
    ]

    const bubbleDatasets = [
        {
            name: 'Income',
            data: [
                { x: 20, y: 30, r: 15 },
                { x: 40, y: 10, r: 10 },
                { x: 50, y: 40, r: 8 },
            ],
            color: 'rgb(59, 130, 246)',
        },
        {
            name: 'Outcome',
            data: [
                { x: 30, y: 20, r: 12 },
                { x: 25, y: 35, r: 18 },
            ],
            color: 'rgb(6, 182, 212)',
        },
        {
            name: 'Others',
            data: [
                { x: 15, y: 25, r: 8 },
                { x: 45, y: 30, r: 14 },
            ],
            color: 'rgb(209, 213, 219)',
        },
    ]

    const sparklineData = [5, 10, 5, 20, 8, 15, 12, 18, 6, 14]

    return (
        <PageUiLayout title='Chart - Lockness UI' currentPath='/ui/chart'>
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

                {/* Doughnut Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        DOUGHNUT CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A doughnut chart displays data as segments of a ring.
                        Perfect for showing proportions with a clean, modern
                        look.
                    </p>
                    <Card>
                        <CardContent class='flex flex-col items-center gap-4 py-8'>
                            <div class='w-64'>
                                <PieChart
                                    chartId='doughnut-chart'
                                    data={pieData}
                                    doughnut
                                />
                            </div>
                            <ChartLegend
                                items={pieData.map((item) => ({
                                    label: item.label,
                                    color: item.color,
                                }))}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<PieChart
  chartId="doughnut-chart"
  data={[
    { label: 'Income', value: 50, color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', value: 30, color: 'rgb(6, 182, 212)' },
    { label: 'Others', value: 20, color: 'rgb(209, 213, 219)' },
  ]}
  doughnut
/>`}
                    </CodeBlock>
                </section>

                {/* Pie Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PIE CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A pie chart displays data as segments of a circle. Ideal
                        for showing parts of a whole.
                    </p>
                    <Card>
                        <CardContent class='flex flex-col items-center gap-4 py-8'>
                            <div class='w-64'>
                                <PieChart
                                    chartId='pie-chart'
                                    data={pieData}
                                />
                            </div>
                            <ChartLegend
                                items={pieData.map((item) => ({
                                    label: item.label,
                                    color: item.color,
                                }))}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<PieChart
  chartId="pie-chart"
  data={[
    { label: 'Income', value: 50, color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', value: 30, color: 'rgb(6, 182, 212)' },
    { label: 'Others', value: 20, color: 'rgb(209, 213, 219)' },
  ]}
/>`}
                    </CodeBlock>
                </section>

                {/* Bubble Chart */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BUBBLE CHART
                    </h2>
                    <p class='text-muted-foreground'>
                        A bubble chart displays three dimensions of data. The x
                        and y axes represent two values while the bubble size
                        represents a third.
                    </p>
                    <Card>
                        <CardContent class='flex flex-col items-center gap-4 py-8'>
                            <BubbleChart
                                chartId='bubble-chart'
                                datasets={bubbleDatasets}
                                height='300px'
                            />
                            <ChartLegend
                                items={bubbleDatasets.map((dataset) => ({
                                    label: dataset.name,
                                    color: dataset.color,
                                }))}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<BubbleChart
  chartId="bubble-chart"
  datasets={[
    {
      name: 'Income',
      data: [
        { x: 20, y: 30, r: 15 },
        { x: 40, y: 10, r: 10 },
      ],
      color: 'rgb(59, 130, 246)',
    },
    {
      name: 'Outcome',
      data: [
        { x: 30, y: 20, r: 12 },
      ],
      color: 'rgb(6, 182, 212)',
    },
  ]}
/>`}
                    </CodeBlock>
                </section>

                {/* Sparklines */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SPARKLINES
                    </h2>
                    <p class='text-muted-foreground'>
                        Sparklines are small, inline charts that fit within text
                        or table cells. They provide quick visual indicators of
                        trends.
                    </p>
                    <Card>
                        <CardContent class='py-8'>
                            <div class='flex flex-col gap-4 max-w-md mx-auto'>
                                <div class='flex items-center justify-between gap-4 p-3 rounded-lg border border-border'>
                                    <div class='flex items-center gap-3'>
                                        <span class='size-2 rounded-full bg-blue-500'>
                                        </span>
                                        <span class='text-foreground font-medium'>
                                            Line Sparkline
                                        </span>
                                    </div>
                                    <div class='w-24 h-8'>
                                        <Sparkline
                                            chartId='sparkline-line'
                                            data={sparklineData}
                                            type='line'
                                            color='rgb(59, 130, 246)'
                                        />
                                    </div>
                                </div>
                                <div class='flex items-center justify-between gap-4 p-3 rounded-lg border border-border'>
                                    <div class='flex items-center gap-3'>
                                        <span class='size-2 rounded-full bg-cyan-500'>
                                        </span>
                                        <span class='text-foreground font-medium'>
                                            Area Sparkline
                                        </span>
                                    </div>
                                    <div class='w-24 h-8'>
                                        <Sparkline
                                            chartId='sparkline-area'
                                            data={sparklineData}
                                            type='area'
                                            color='rgb(6, 182, 212)'
                                        />
                                    </div>
                                </div>
                                <div class='flex items-center justify-between gap-4 p-3 rounded-lg border border-border'>
                                    <div class='flex items-center gap-3'>
                                        <span class='size-2 rounded-full bg-purple-500'>
                                        </span>
                                        <span class='text-foreground font-medium'>
                                            Bar Sparkline
                                        </span>
                                    </div>
                                    <div class='w-24 h-8'>
                                        <Sparkline
                                            chartId='sparkline-bar'
                                            data={sparklineData}
                                            type='bar'
                                            color='rgb(147, 51, 234)'
                                        />
                                    </div>
                                </div>
                                <div class='flex items-center justify-between gap-4 p-3 rounded-lg border border-border'>
                                    <div class='flex items-center gap-3'>
                                        <span class='size-2 rounded-full bg-green-500'>
                                        </span>
                                        <span class='text-foreground font-medium'>
                                            Pie Sparkline
                                        </span>
                                    </div>
                                    <div class='size-10'>
                                        <SparklinePie
                                            chartId='sparkline-pie'
                                            data={[40, 35, 25]}
                                            colors={[
                                                'rgb(34, 197, 94)',
                                                'rgb(59, 130, 246)',
                                                'rgb(209, 213, 219)',
                                            ]}
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`{/* Line Sparkline */}
<Sparkline
  chartId="sparkline-line"
  data={[5, 10, 5, 20, 8, 15, 12, 18, 6, 14]}
  type="line"
  color="rgb(59, 130, 246)"
/>

{/* Area Sparkline */}
<Sparkline
  chartId="sparkline-area"
  data={[5, 10, 5, 20, 8, 15, 12, 18, 6, 14]}
  type="area"
  color="rgb(6, 182, 212)"
/>

{/* Bar Sparkline */}
<Sparkline
  chartId="sparkline-bar"
  data={[5, 10, 5, 20, 8, 15, 12, 18, 6, 14]}
  type="bar"
  color="rgb(147, 51, 234)"
/>

{/* Pie Sparkline */}
<SparklinePie
  chartId="sparkline-pie"
  data={[40, 35, 25]}
  colors={[
    'rgb(34, 197, 94)',
    'rgb(59, 130, 246)',
    'rgb(209, 213, 219)',
  ]}
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
                        PieChart Props
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
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        {'{label, value, color}[]'}
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Pie/doughnut segments
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        doughnut
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Render as doughnut with center cutout
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        cutout
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        '65%'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Doughnut center size (CSS percentage)
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        BubbleChart Props
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
                                        datasets
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        BubbleDataset[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Bubble data with x, y, r values
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        height
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        300
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Chart height in pixels
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        Sparkline Props
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
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number[]
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Data values for the sparkline
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        type
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'line' | 'area' | 'bar'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'line'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Sparkline visualization type
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
                                        Line/bar color
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        SparklinePie Props
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
                                        data
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        {'{value, color}[]'}
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        required
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Pie segments with value and color
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
