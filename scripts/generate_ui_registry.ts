/**
 * @fileoverview Generator for UI examples registry (Site specific).
 * 
 * Scans all component directories for examples.tsx and generates
 * a static registry file for production builds.
 */

import { generateUiRegistry } from "../packages/ui/registry_generator.ts";
import { join } from "@std/path";

async function main() {
    const componentsDir = join(Deno.cwd(), "packages/ui/components");
    const outputFile = join(Deno.cwd(), "packages/ui/examples_registry.ts");

    await generateUiRegistry(componentsDir, outputFile);
}

if (import.meta.main) {
    await main();
}
