import { ace } from "./lockness/cli.ts";

if (import.meta.main) {
    await ace.run(Deno.args);
}
