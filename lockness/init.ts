import { parseArgs } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs";
import { join, dirname } from "@std/path";

const ARGS = parseArgs(Deno.args);
const PROJECT_NAME = ARGS._[0] || "lockness-app";
const BASE_URL = "https://raw.githubusercontent.com/locknessjs/lockness/main";

async function fetchFile(path: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/${path}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.statusText}`);
    return res.text();
}

async function write(path: string, content: string) {
    const fullPath = join(String(PROJECT_NAME), path);
    await ensureDir(dirname(fullPath));
    await Deno.writeTextFile(fullPath, content);
    console.log(`Created ${path}`);
}

async function main() {
    console.log(`Scaffolding Lockness project in ${PROJECT_NAME}...`);
    await ensureDir(String(PROJECT_NAME));

    // 1. Create main.ts
    const mainTs = await fetchFile("main.ts");
    await write("main.ts", mainTs);

    // 2. Create ace.ts
    // Replace relative import with package import
    let aceTs = await fetchFile("ace.ts");
    aceTs = aceTs.replace('"./lockness/cli.ts"', '"jsr:@lockness/core/cli"');
    await write("ace.ts", aceTs);

    // 3. Create src/kernel.ts
    const kernelTs = await fetchFile("src/kernel.ts");
    await write("src/kernel.ts", kernelTs);

    // 4. Create controller
    const todoController = await fetchFile("src/controller/todo_controller.ts");
    await write("src/controller/todo_controller.ts", todoController);

    // 5. Create data
    const todoData = await fetchFile("data/todo.json");
    await write("data/todo.json", todoData);

    // 6. Create deno.json
    const denoJson = {
        "tasks": {
            "dev": "deno run --env-file=.env -A --watch main.ts",
            "start": "deno run --allow-net --allow-env main.ts",
            "ace": "deno run -A ace.ts"
        },
        "imports": {
            "@/": "./",
            "@controller/": "./src/controller/",
            "@service/": "./src/service/",
            "@middleware/": "./src/middleware/",
            "@model/": "./src/model/",
            "@repository/": "./src/repository/",
            "@kernel": "./src/kernel.ts",
            "lockness": "jsr:@lockness/core@^0.1.0",
            "@std/assert": "jsr:@std/assert@1",
            "hono": "npm:hono@^4.11.1"
        },
        "compilerOptions": {
            "jsx": "precompile",
            "jsxImportSource": "hono/jsx"
        }
    };
    await write("deno.json", JSON.stringify(denoJson, null, 4));

    // 7. Create empty directories
    const dirs = [
        "src/model",
        "src/service",
        "src/middleware",
        "src/repository",
        "public"
    ];

    for (const dir of dirs) {
        await ensureDir(join(String(PROJECT_NAME), dir));
    }

    console.log("\nDone! To get started:");
    console.log(`  cd ${PROJECT_NAME}`);
    console.log("  deno task dev");
}

if (import.meta.main) {
    await main();
}
