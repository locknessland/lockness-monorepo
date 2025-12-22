

import { Stub } from './stubs.ts'

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

            try {
                const content = await Stub.render('make', 'controller', {
                    className,
                    route: name.toLowerCase()
                });

                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ Controller created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create controller: ${(error as Error).message}`);
            }
        });

        this.register("make:middleware", async (args) => {
            const name = args[0];
            if (!name) {
                console.error("❌ Please provide a middleware name (e.g., Auth)");
                return;
            }

            const className = name.charAt(0).toUpperCase() + name.slice(1);
            const fileName = `${name.toLowerCase()}_middleware.ts`;
            const dirPath = `./src/middleware`;
            const filePath = `${dirPath}/${fileName}`;

            try {
                const content = await Stub.render('make', 'middleware', {
                    className
                });

                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ Middleware created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create middleware: ${(error as Error).message}`);
            }
        });

        this.register("make:model", async (args) => {
            const name = args[0];
            if (!name) {
                console.error("❌ Please provide a model name (e.g., User)");
                return;
            }

            const className = name.charAt(0).toUpperCase() + name.slice(1);
            const fileName = `${name.toLowerCase()}.ts`;
            const dirPath = `./src/model`;
            const filePath = `${dirPath}/${fileName}`;

            try {
                const tableName = name.toLowerCase() + 's';
                const content = await Stub.render('make', 'model', {
                    className,
                    tableName
                });

                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ Model created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create model: ${(error as Error).message}`);
            }
        });

        this.register("make:service", async (args) => {
            const name = args[0];
            if (!name) {
                console.error("❌ Please provide a service name (e.g., Auth)");
                return;
            }

            const className = name.charAt(0).toUpperCase() + name.slice(1);
            const fileName = `${name.toLowerCase()}_service.ts`;
            const dirPath = `./src/service`;
            const filePath = `${dirPath}/${fileName}`;

            try {
                const content = await Stub.render('make', 'service', {
                    className
                });

                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ Service created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create service: ${(error as Error).message}`);
            }
        });

        this.register("make:repository", async (args) => {
            const name = args[0];
            if (!name) {
                console.error("❌ Please provide a repository name (e.g., User)");
                return;
            }

            const className = name.charAt(0).toUpperCase() + name.slice(1);
            const modelFileName = name.toLowerCase();
            const fileName = `${name.toLowerCase()}_repository.ts`;
            const dirPath = `./src/repository`;
            const filePath = `${dirPath}/${fileName}`;

            try {
                const tableName = name.toLowerCase() + 's';
                const content = await Stub.render('make', 'repository', {
                    className,
                    modelFileName,
                    tableName
                });

                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ Repository created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create repository: ${(error as Error).message}`);
            }
        });

        this.register("make:view", async (args) => {
            const name = args[0];
            if (!name) {
                console.error("❌ Please provide a view name (e.g., Post)");
                return;
            }

            const className = name.charAt(0).toUpperCase() + name.slice(1);
            const fileName = name.toLowerCase();
            const dirPath = `./src/view/pages`;
            const filePath = `${dirPath}/${fileName}.tsx`;

            try {
                const content = await Stub.render('make', 'view', {
                    className,
                    fileName
                });

                await Deno.mkdir(dirPath, { recursive: true });
                await Deno.writeTextFile(filePath, content);
                console.log(`✅ View created at ${filePath}`);
            } catch (error) {
                console.error(`❌ Failed to create view: ${(error as Error).message}`);
            }
        });

        this.register("list", () => {




            console.log("Available commands:");
            for (const cmd of this.commands.keys()) {
                console.log(`  - ${cmd}`);
            }
            return Promise.resolve();
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

export const ace: Ace = new Ace();

