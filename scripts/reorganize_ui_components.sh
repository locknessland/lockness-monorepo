#!/bin/bash
# Script to reorganize UI components into folder structure

set -e

COMPONENTS_DIR="packages/ui/components"

COMPONENTS=(
    "Accordion"
    "Alert"
    "Badge"
    "Breadcrumb"
    "Button"
    "Card"
    "Chart"
    "ChartExtras"
    "Checkbox"
    "CircularProgress"
    "CodeBlock"
    "CopyButton"
    "FeatureCard"
    "Footer"
    "Gallery"
    "GaugeProgress"
    "Hero"
    "Input"
    "Kbd"
    "Label"
    "Link"
    "Modal"
    "Navbar"
    "Newsletter"
    "Pagination"
    "Pricing"
    "Progress"
    "RootLayout"
    "SearchBar"
    "Section"
    "Separator"
    "Sidebar"
    "Skeleton"
    "Spinner"
    "SteppedProgress"
    "Switch"
    "Table"
    "Tabs"
    "Textarea"
    "ThemeSwitch"
    "Title"
    "TreeView"
    "UploadZone"
)

echo "🔄 Reorganizing UI components into folder structure..."
echo ""

for component in "${COMPONENTS[@]}"; do
    component_file="${COMPONENTS_DIR}/${component}.tsx"
    component_folder="${COMPONENTS_DIR}/${component}"
    index_file="${component_folder}/index.tsx"
    docs_file="${component_folder}/DOCS.md"
    
    if [ -f "$component_file" ]; then
        # Create component folder
        mkdir -p "$component_folder"
        
        # Move component file to index.tsx
        mv "$component_file" "$index_file"
        echo "✅ Moved ${component}.tsx → ${component}/index.tsx"
        
        # Create placeholder DOCS.md
        cat > "$docs_file" << EOF
# ${component}

Documentation for the ${component} component.

## Installation

\`\`\`bash
deno run -A jsr:@lockness/ui add ${component,,}
\`\`\`

## Usage

\`\`\`tsx
import { ${component} } from '@lockness/ui/components'

// Example usage here
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| TBD  | TBD  | TBD     | TBD         |

## Examples

### Basic Example

\`\`\`tsx
// Add example here
\`\`\`
EOF
        
        echo "📝 Created ${component}/DOCS.md"
        echo ""
    else
        echo "⚠️  ${component}.tsx not found, skipping..."
        echo ""
    fi
done

echo "✨ Reorganization complete!"
