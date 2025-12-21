import { parseArgs } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs";
import { join, dirname } from "@std/path";

const ARGS = parseArgs(Deno.args);
const PROJECT_NAME = ARGS._[0] || "lockness-app";

// Templates stored as strings to avoid fetching from private repo
const TEMPLATES = {
    "main.ts": `import { bootstrap } from '@kernel'

const app = await bootstrap()
await app.listen(Number(Deno.env.get('PORT') || 8888))
`,
    "ace.ts": `import { ace } from "jsr:@lockness/core/cli";

if (import.meta.main) {
    await ace.run(Deno.args);
}
`,
    "src/kernel.ts": `import { App, type Module } from 'lockness'
import { TodoController } from '@controller/todo_controller.ts'

export const bootstrap = async () => {
    // Create Lockness application
    const app = new App()

    // Configure module
    const module: Module = {
        // deno-lint-ignore no-explicit-any
        controllers: [TodoController as any],
    }

    // Initialize the application with the module
    await app.init(module)

    return app
}
`,
    "src/controller/todo_controller.ts": `import { Controller, Get, Post, Context } from 'lockness'
import todo from '@/data/todo.json' with { type: 'json' }

interface Todo {
    id: number
    title: string
    completed: boolean
}

@Controller('/todos')
export class TodoController {
    private todos: Todo[] = todo

    @Get()
    findAll(c: Context) {
        return c.json(this.todos)
    }

    @Get('/:id')
    findOne(c: Context) {
        const id = parseInt(c.req.param('id'))
        const todo = this.todos.find((t) => t.id === id)

        if (!todo) {
            return c.json({ error: 'Todo not found' }, 404)
        }

        return c.json(todo)
    }

    @Post()
    async create(c: Context) {
        const body = await c.req.json()
        const newTodo: Todo = {
            id: this.todos.length + 1,
            title: body.title,
            completed: false,
        }

        this.todos.push(newTodo)
        return c.json(this.todos, 201)
    }
}
`,
    "data/todo.json": `[
  {
    "id": 1,
    "title": "Learn Lockness JS",
    "description": "Explore the fullstack MVC framework for Deno.",
    "completed": true,
    "createdAt": "2025-12-21T10:00:00Z"
  },
  {
    "id": 2,
    "title": "Set up project structure",
    "description": "Organize controllers, models, and views.",
    "completed": true,
    "createdAt": "2025-12-21T11:30:00Z"
  }
]
`
};

async function write(path: string, content: string) {
    const fullPath = join(String(PROJECT_NAME), path);
    await ensureDir(dirname(fullPath));
    await Deno.writeTextFile(fullPath, content);
    console.log(`Created ${path}`);
}

async function main() {
    console.log(`Scaffolding Lockness project in ${PROJECT_NAME}...`);
    await ensureDir(String(PROJECT_NAME));

    // Write file templates
    for (const [path, content] of Object.entries(TEMPLATES)) {
        await write(path, content);
    }

    // Create deno.json
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

    // Create empty directories
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
