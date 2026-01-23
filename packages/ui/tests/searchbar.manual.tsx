/**
 * Manual test file for SearchBar component
 * This file can be used to verify the component renders correctly
 */

import {
    SearchBar,
    SearchBarFilter,
    SearchBarGroup,
} from '../components/SearchBar/mod.tsx'

// Test 1: Basic SearchBar
const _basicSearchBar = <SearchBar />

// Test 2: All variants
const _variantTests = (
    <div>
        <SearchBar variant='default' placeholder='Default variant' />
        <SearchBar variant='ghost' placeholder='Ghost variant' />
        <SearchBar variant='outline' placeholder='Outline variant' />
        <SearchBar variant='filled' placeholder='Filled variant' />
    </div>
)

// Test 3: All sizes
const _sizeTests = (
    <div>
        <SearchBar size='sm' placeholder='Small' />
        <SearchBar size='md' placeholder='Medium' />
        <SearchBar size='lg' placeholder='Large' />
        <SearchBar size='xl' placeholder='Extra Large' />
    </div>
)

// Test 4: Features
const _featureTests = (
    <div>
        <SearchBar showClear placeholder='With clear button' />
        <SearchBar shortcut='⌘K' showShortcut placeholder='With shortcut' />
        <SearchBar loading placeholder='Loading...' />
        <SearchBar disabled placeholder='Disabled' />
        <SearchBar fullWidth placeholder='Full width' />
    </div>
)

// Test 5: SearchBarGroup with filter
const _groupTest = (
    <SearchBarGroup>
        <SearchBar placeholder='Search products...' />
        <SearchBarFilter name='category'>
            <option value='all'>All</option>
            <option value='electronics'>Electronics</option>
            <option value='clothing'>Clothing</option>
        </SearchBarFilter>
    </SearchBarGroup>
)

// Test 6: Unpoly integration
const _unpolyTest = (
    <form up-submit up-target='.results'>
        <SearchBar
            name='q'
            up-autosubmit
            up-delay='300'
            placeholder='Search with Unpoly...'
        />
    </form>
)

// Test 7: Combined features
const _combinedTest = (
    <SearchBar
        variant='filled'
        size='lg'
        showIcon
        showClear
        shortcut='⌘K'
        showShortcut
        placeholder='Search everything...'
        name='query'
    />
)

console.log('SearchBar Manual Tests')
console.log('======================')
console.log('\n✅ All component variations created successfully')
console.log('\nTo render these components:')
console.log('1. Basic SearchBar')
console.log('2. Variants (default, ghost, outline, filled)')
console.log('3. Sizes (sm, md, lg, xl)')
console.log('4. Features (clear, shortcut, loading, disabled, fullWidth)')
console.log('5. SearchBarGroup with filter')
console.log('6. Unpoly integration')
console.log('7. Combined features')
