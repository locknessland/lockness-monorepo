# Chart

Documentation for the Chart component.

## Installation

```bash
deno run -A jsr:@lockness/ui add chart
```

## Usage

```tsx
import { AreaChart, ChartScript } from '@lockness/ui/components'

// Include ChartScript once in your layout to load Chart.js
<ChartScript />

<AreaChart
    chartId='monthly-sales'
    labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']}
    data={[65, 59, 80, 81, 56, 72]}
/>
```

## Props

### AreaChart

| Prop           | Type             | Default                     | Description                                                    |
| -------------- | ---------------- | --------------------------- | -------------------------------------------------------------- |
| chartId        | `string`         | **required**                | Unique ID for the chart (required for Chart.js initialization) |
| labels         | `string[]`       | **required**                | Chart labels (x-axis)                                          |
| data           | `number[]`       | -                           | Single dataset values (for single area chart)                  |
| datasets       | `ChartDataset[]` | -                           | Multiple datasets (for multiple area charts)                   |
| color          | `string`         | `'rgb(59, 130, 246)'`       | Primary color for single dataset                               |
| fillColor      | `string`         | `'rgba(59, 130, 246, 0.1)'` | Fill color for single dataset (with opacity)                   |
| curved         | `boolean`        | `false`                     | Whether to use curved lines                                    |
| compareTooltip | `boolean`        | `false`                     | Whether to show compare tooltip (two values side by side)      |
| height         | `string`         | `'300px'`                   | Chart height                                                   |
| class          | `string`         | -                           | Custom class name                                              |
| id             | `string`         | -                           | Element ID                                                     |

### ChartLegend

| Prop     | Type                           | Default      | Description            |
| -------- | ------------------------------ | ------------ | ---------------------- |
| items    | `ChartLegendItemProps[]`       | **required** | Legend items           |
| position | `'start' \| 'center' \| 'end'` | `'end'`      | Position of the legend |
| class    | `string`                       | -            | Custom class name      |
| id       | `string`                       | -            | Element ID             |

### ChartLegendItem

| Prop  | Type     | Default      | Description                   |
| ----- | -------- | ------------ | ----------------------------- |
| label | `string` | **required** | Legend label text             |
| color | `string` | **required** | Color of the legend indicator |

### ChartDataPoint

| Prop  | Type     | Default      | Description      |
| ----- | -------- | ------------ | ---------------- |
| label | `string` | **required** | Data point label |
| value | `number` | **required** | Data point value |

### ChartDataset

| Prop      | Type       | Default      | Description               |
| --------- | ---------- | ------------ | ------------------------- |
| name      | `string`   | **required** | Dataset name              |
| data      | `number[]` | **required** | Dataset values            |
| color     | `string`   | **required** | Line color                |
| fillColor | `string`   | -            | Fill color (with opacity) |
