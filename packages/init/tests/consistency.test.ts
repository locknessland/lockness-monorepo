import { assertEquals } from '@std/assert'
import { join, relative } from '@std/path'
import { walk } from '@std/fs'
import { BINARY_FILES, INIT_STUB_FILES } from '../mod.ts'

Deno.test('Init Package - INIT_STUB_FILES should be complete', async () => {
    const stubsDir = join(Deno.cwd(), 'packages/init/stubs/init')
    const foundFiles: string[] = []

    for await (const entry of walk(stubsDir, { includeDirs: false })) {
        const relPath = relative(stubsDir, entry.path)
        foundFiles.push(relPath)
    }

    // Normalize paths (Windows/Unix) and sort
    const normalizedFound = foundFiles.map((p) => p.replace(/\\/g, '/')).sort()
    const normalizedDefined = [...INIT_STUB_FILES].sort()
    const normalizedBinary = [...BINARY_FILES].sort()

    // Check for missing files (excluding binary files)
    const missing = normalizedFound.filter((f) =>
        !normalizedDefined.includes(f) &&
        !normalizedBinary.includes(f)
    )

    if (missing.length > 0) {
        console.error('❌ Missing files in INIT_STUB_FILES:', missing)
    }

    assertEquals(
        missing.length,
        0,
        `Found ${missing.length} missing files in INIT_STUB_FILES list. Run the test to see the list.`,
    )
})
