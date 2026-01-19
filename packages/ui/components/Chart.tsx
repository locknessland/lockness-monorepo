/**
 * Chart Components
 *
 * Area chart components using Chart.js via CDN.
 * Supports single area, multiple area, and curved area charts.
 *
 * @module
 */

import type { FC } from '@lockness/core'
import type { JSX } from '@lockness/core/jsx-runtime'
import { cn } from '../lib/utils.ts'

/**
 * Chart data point
 */
export interface ChartDataPoint {
    label: string
    value: number
}

/**
 * Chart dataset for multiple series
 */
export interface ChartDataset {
    name: string
    data: number[]
    color: string
    fillColor?: string
}

/**
 * Legend item props
 */
export interface ChartLegendItemProps {
    /**
     * Legend label text
     */
    label: string
    /**
     * Color of the legend indicator
     */
    color: string
}

/**
 * ChartLegendItem Component
 *
 * Individual legend item for chart legends.
 */
export const ChartLegendItem: FC<ChartLegendItemProps> = ({
    label,
    color,
}) => {
    return (
        <div class='inline-flex items-center'>
            <span
                class='size-2.5 inline-block rounded-sm me-2'
                style={`background-color: ${color}; border-radius: var(--radius)`}
            />
            <span class='text-[13px] text-muted-foreground'>
                {label}
            </span>
        </div>
    )
}

/**
 * ChartLegend props
 */
export interface ChartLegendProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Legend items
     */
    items: ChartLegendItemProps[]
    /**
     * Position of the legend
     * @default 'end'
     */
    position?: 'start' | 'center' | 'end'
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * ChartLegend Component
 *
 * Legend container for chart legends.
 */
export const ChartLegend: FC<ChartLegendProps> = ({
    items,
    position = 'end',
    class: className,
    id,
    ...props
}) => {
    const positionStyles = {
        start: 'justify-start',
        center: 'justify-center',
        end: 'justify-center sm:justify-end',
    }

    return (
        <div
            id={id}
            class={cn(
                'flex items-center gap-x-4 mb-3 sm:mb-6',
                positionStyles[position],
                className,
            )}
            {...props}
        >
            {items.map((item) => (
                <ChartLegendItem
                    key={item.label}
                    {...item}
                />
            ))}
        </div>
    )
}

/**
 * AreaChart props
 */
export interface AreaChartProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart (required for Chart.js initialization)
     */
    chartId: string
    /**
     * Chart labels (x-axis)
     */
    labels: string[]
    /**
     * Single dataset values (for single area chart)
     */
    data?: number[]
    /**
     * Multiple datasets (for multiple area charts)
     */
    datasets?: ChartDataset[]
    /**
     * Primary color for single dataset
     * @default 'rgb(59, 130, 246)'
     */
    color?: string
    /**
     * Fill color for single dataset (with opacity)
     * @default 'rgba(59, 130, 246, 0.1)'
     */
    fillColor?: string
    /**
     * Whether to use curved lines
     * @default false
     */
    curved?: boolean
    /**
     * Whether to show compare tooltip (two values side by side)
     * @default false
     */
    compareTooltip?: boolean
    /**
     * Chart height
     * @default '300px'
     */
    height?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * AreaChart Component
 *
 * An area chart component using Chart.js.
 * Renders a canvas and provides initialization script.
 *
 * @example
 * ```tsx
 * // Single area chart
 * <AreaChart
 *   chartId="sales-chart"
 *   labels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
 *   data={[100, 200, 150, 300, 250]}
 * />
 *
 * // Multiple area chart
 * <AreaChart
 *   chartId="income-outcome"
 *   labels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
 *   datasets={[
 *     { name: 'Income', data: [100, 200, 150, 300, 250], color: 'rgb(59, 130, 246)' },
 *     { name: 'Outcome', data: [80, 150, 120, 200, 180], color: 'rgb(147, 51, 234)' },
 *   ]}
 * />
 *
 * // Curved area chart
 * <AreaChart
 *   chartId="curved-chart"
 *   labels={['Jan', 'Feb', 'Mar']}
 *   data={[100, 200, 150]}
 *   curved
 * />
 * ```
 */
export const AreaChart: FC<AreaChartProps> = ({
    chartId,
    labels,
    data,
    datasets,
    color = 'rgb(59, 130, 246)',
    fillColor = 'rgba(59, 130, 246, 0.1)',
    curved = false,
    compareTooltip = false,
    height = '300px',
    class: className,
    id,
    ...props
}) => {
    // Build datasets configuration
    const chartDatasets = datasets
        ? datasets.map((ds) => ({
            label: ds.name,
            data: ds.data,
            borderColor: ds.color,
            backgroundColor: ds.fillColor ||
                ds.color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            fill: true,
            tension: curved ? 0.4 : 0,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
        }))
        : [
            {
                label: 'Value',
                data: data || [],
                borderColor: color,
                backgroundColor: fillColor,
                fill: true,
                tension: curved ? 0.4 : 0,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
            },
        ]

    // Chart configuration as JSON for the script
    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: chartDatasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    mode: compareTooltip ? 'index' : 'nearest',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: compareTooltip,
                    callbacks: {},
                },
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
                y: {
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div id={id} class={cn('relative', className)} {...props}>
            <div style={`height: ${height}`}>
                <canvas id={chartId} />
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}

/**
 * ChartScript Component
 *
 * Loads Chart.js from CDN. Include this once in your layout or page.
 *
 * @example
 * ```tsx
 * <ChartScript />
 * ```
 */
export const ChartScript: FC = () => {
    return (
        <script
            src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.min.js'
            defer
        />
    )
}

/**
 * BarChart props
 */
export interface BarChartProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart (required for Chart.js initialization)
     */
    chartId: string
    /**
     * Chart labels (x-axis for vertical, y-axis for horizontal)
     */
    labels: string[]
    /**
     * Single dataset values (for single bar chart)
     */
    data?: number[]
    /**
     * Multiple datasets (for multiple bar charts)
     */
    datasets?: ChartDataset[]
    /**
     * Primary color for single dataset
     * @default 'rgb(59, 130, 246)'
     */
    color?: string
    /**
     * Whether to display bars horizontally
     * @default false
     */
    horizontal?: boolean
    /**
     * Bar border radius
     * @default 4
     */
    borderRadius?: number
    /**
     * Chart height
     * @default '300px'
     */
    height?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * BarChart Component
 *
 * A bar chart component using Chart.js.
 * Supports single/multiple datasets and horizontal orientation.
 *
 * @example
 * ```tsx
 * // Single bar chart
 * <BarChart
 *   chartId="sales-chart"
 *   labels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
 *   data={[100, 200, 150, 300, 250]}
 * />
 *
 * // Multiple bar chart
 * <BarChart
 *   chartId="income-outcome"
 *   labels={['Jan', 'Feb', 'Mar']}
 *   datasets={[
 *     { name: 'Income', data: [100, 200, 150], color: 'rgb(59, 130, 246)' },
 *     { name: 'Outcome', data: [80, 150, 120], color: 'rgb(209, 213, 219)' },
 *   ]}
 * />
 *
 * // Horizontal bar chart
 * <BarChart
 *   chartId="horizontal-chart"
 *   labels={['Product A', 'Product B', 'Product C']}
 *   data={[100, 200, 150]}
 *   horizontal
 * />
 * ```
 */
export const BarChart: FC<BarChartProps> = ({
    chartId,
    labels,
    data,
    datasets,
    color = 'rgb(59, 130, 246)',
    horizontal = false,
    borderRadius = 4,
    height = '300px',
    class: className,
    id,
    ...props
}) => {
    // Build datasets configuration
    const chartDatasets = datasets
        ? datasets.map((ds) => ({
            label: ds.name,
            data: ds.data,
            backgroundColor: ds.color,
            borderRadius: borderRadius,
            barThickness: 'flex' as const,
            maxBarThickness: 25,
        }))
        : [
            {
                label: 'Value',
                data: data || [],
                backgroundColor: color,
                borderRadius: borderRadius,
                barThickness: 'flex' as const,
                maxBarThickness: 25,
            },
        ]

    // Chart configuration
    const chartConfig = {
        type: 'bar',
        data: {
            labels,
            datasets: chartDatasets,
        },
        options: {
            indexAxis: horizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                },
            },
            scales: {
                x: {
                    grid: {
                        display: horizontal,
                        color: 'rgba(156, 163, 175, 0.1)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
                y: {
                    grid: {
                        display: !horizontal,
                        color: 'rgba(156, 163, 175, 0.1)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div id={id} class={cn('relative', className)} {...props}>
            <div style={`height: ${height}`}>
                <canvas id={chartId} />
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}

/**
 * LineChart props
 */
export interface LineChartProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart (required for Chart.js initialization)
     */
    chartId: string
    /**
     * Chart labels (x-axis)
     */
    labels: string[]
    /**
     * Single dataset values (for single line chart)
     */
    data?: number[]
    /**
     * Multiple datasets (for multiple line charts)
     */
    datasets?: ChartDataset[]
    /**
     * Primary color for single dataset
     * @default 'rgb(59, 130, 246)'
     */
    color?: string
    /**
     * Whether to use curved lines
     * @default false
     */
    curved?: boolean
    /**
     * Whether to show compare tooltip (all values side by side)
     * @default false
     */
    compareTooltip?: boolean
    /**
     * Chart height
     * @default '300px'
     */
    height?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * LineChart Component
 *
 * A line chart component using Chart.js (no fill).
 *
 * @example
 * ```tsx
 * // Single line chart
 * <LineChart
 *   chartId="sales-chart"
 *   labels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
 *   data={[100, 200, 150, 300, 250]}
 * />
 *
 * // Multiple line chart
 * <LineChart
 *   chartId="income-outcome"
 *   labels={['Jan', 'Feb', 'Mar']}
 *   datasets={[
 *     { name: 'Income', data: [100, 200, 150], color: 'rgb(59, 130, 246)' },
 *     { name: 'Outcome', data: [80, 150, 120], color: 'rgb(147, 51, 234)' },
 *   ]}
 * />
 *
 * // Curved line chart
 * <LineChart
 *   chartId="curved-chart"
 *   labels={['Jan', 'Feb', 'Mar']}
 *   data={[100, 200, 150]}
 *   curved
 * />
 * ```
 */
export const LineChart: FC<LineChartProps> = ({
    chartId,
    labels,
    data,
    datasets,
    color = 'rgb(59, 130, 246)',
    curved = false,
    compareTooltip = false,
    height = '300px',
    class: className,
    id,
    ...props
}) => {
    // Build datasets configuration - LineChart
    const chartDatasets = datasets
        ? datasets.map((ds) => ({
            label: ds.name,
            data: ds.data,
            borderColor: ds.color,
            backgroundColor: ds.color,
            fill: false,
            tension: curved ? 0.4 : 0,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
        }))
        : [
            {
                label: 'Value',
                data: data || [],
                borderColor: color,
                backgroundColor: color,
                fill: false,
                tension: curved ? 0.4 : 0,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
            },
        ]

    // Chart configuration
    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: chartDatasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    mode: compareTooltip ? 'index' : 'nearest',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: compareTooltip,
                },
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
                y: {
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div id={id} class={cn('relative', className)} {...props}>
            <div style={`height: ${height}`}>
                <canvas id={chartId} />
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}
