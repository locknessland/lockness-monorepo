import { Stub } from './stubs.ts'

export class Ace {
    private commands: Map<string, (args: string[]) => Promise<void>> = new Map();

    constructor() {
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
export { Stub }
