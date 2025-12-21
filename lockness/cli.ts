import { ControllerClass } from "./core.ts";

export class Ace {
    private commands: Map<string, (args: string[]) => Promise<void>> = new Map();

    constructor() {
        this.registerDefaultCommands();
    }

    private registerDefaultCommands() {
        this.register("make:controller", async (args) => {
            const name = args[0];
            if (!name) {
                console.error("❌ Please provide a controller name (e.g., User)");
                return;
            }

            const className = name.charAt(0).toUpperCase() + name.slice(1);
            const fileName = `${name.toLowerCase()}_controller.ts`;
            const dirPath = `./src/controller`;
            const filePath = `${dirPath}/${fileName}`;

            const content = `import { Controller, Get, Context } from 'lockness'

@Controller('/${name.toLowerCase()}')
export class ${className}Controller {
    @Get('/')
    index(c: Context) {
        return c.json({ message: 'Hello from ${className}Controller' })
    }
}
`;

            try {
                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ Controller created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create controller: ${error.message}`);
            }
        });

        this.register("list", async () => {
            console.log("Available commands:");
            for (const cmd of this.commands.keys()) {
                console.log(`  - ${cmd}`);
            }
        });
    }

    register(name: string, handler: (args: string[]) => Promise<void>) {
        this.commands.set(name, handler);
    }

    async run(args: string[]) {
        const [commandName, ...rest] = args;

        if (!commandName) {
            await this.commands.get("list")!([]);
            return;
        }

        const handler = this.commands.get(commandName);
        if (handler) {
            await handler(rest);
        } else {
            console.error(`❌ Unknown command: ${commandName}`);
            await this.commands.get("list")!([]);
        }
    }
}

export const ace = new Ace();
