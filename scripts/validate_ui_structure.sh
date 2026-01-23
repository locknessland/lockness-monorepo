#!/bin/bash
# Validation script for UI Components Documentation Colocation
# Verifies that all components have the expected folder structure

set -e

COMPONENTS_DIR="packages/ui/components"
ERRORS=0
WARNINGS=0

echo "🔍 Validating UI Component Structure..."
echo ""

# Components that should have folders
EXPECTED_COMPONENTS=(
    "Accordion" "Alert" "Badge" "Breadcrumb" "Button" "Card" "Chart"
    "ChartExtras" "Checkbox" "CircularProgress" "CodeBlock" "CopyButton"
    "FeatureCard" "Footer" "Gallery" "GaugeProgress" "Hero" "Input" "Kbd"
    "Label" "Link" "Modal" "Navbar" "Newsletter" "Pagination" "Pricing"
    "Progress" "RootLayout" "SearchBar" "Section" "Separator" "Sidebar"
    "Skeleton" "Spinner" "SteppedProgress" "Switch" "Table" "Tabs"
    "Textarea" "ThemeSwitch" "Title" "TreeView" "UploadZone"
)

echo "📦 Checking component folders..."
for component in "${EXPECTED_COMPONENTS[@]}"; do
    component_dir="${COMPONENTS_DIR}/${component}"
    index_file="${component_dir}/index.tsx"
    docs_file="${component_dir}/DOCS.md"
    
    if [ ! -d "$component_dir" ]; then
        echo "❌ ERROR: Missing folder for ${component}"
        ERRORS=$((ERRORS + 1))
        continue
    fi
    
    if [ ! -f "$index_file" ]; then
        echo "❌ ERROR: Missing index.tsx for ${component}"
        ERRORS=$((ERRORS + 1))
    fi
    
    if [ ! -f "$docs_file" ]; then
        echo "❌ ERROR: Missing DOCS.md for ${component}"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check if DOCS.md is just a placeholder
    if [ -f "$docs_file" ]; then
        if grep -q "TBD" "$docs_file" 2>/dev/null; then
            echo "⚠️  WARNING: ${component}/DOCS.md is still a placeholder"
            WARNINGS=$((WARNINGS + 1))
        else
            echo "✅ ${component} - complete"
        fi
    fi
done

echo ""
echo "📄 Checking exports in components.ts..."
if grep -q "from './components/Button/index.tsx'" "${COMPONENTS_DIR}/../components.ts" 2>/dev/null; then
    echo "✅ Exports updated to use new folder structure"
else
    echo "❌ ERROR: Exports in components.ts not updated"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "🎯 Checking UI controller..."
if [ -f "app/controller/ui_controller.tsx" ]; then
    if grep -q "UiDocLoader" "app/controller/ui_controller.tsx" 2>/dev/null; then
        echo "✅ UI controller uses dynamic doc loading"
    else
        echo "❌ ERROR: UI controller not refactored"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "❌ ERROR: UI controller not found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "📝 Checking DocLoader service..."
if [ -f "packages/ui/doc_loader.ts" ]; then
    echo "✅ DocLoader service exists"
else
    echo "❌ ERROR: DocLoader service not found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "🧪 Checking tests..."
if [ -f "packages/ui/tests/doc_loader.test.ts" ]; then
    echo "✅ DocLoader tests exist"
else
    echo "❌ ERROR: DocLoader tests not found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo "✅ Validation passed!"
    if [ $WARNINGS -gt 0 ]; then
        echo "⚠️  ${WARNINGS} component(s) still have placeholder documentation"
        echo "   This is expected - docs can be migrated incrementally"
    fi
    exit 0
else
    echo "❌ Validation failed with ${ERRORS} error(s)"
    exit 1
fi
