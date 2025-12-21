import * as esbuild from "https://deno.land/x/esbuild@v0.21.5/mod.js";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11.0";

const build = async () => {
    console.log("🚀 Building Lockness app...");

    try {
        await esbuild.build({
            plugins: [...denoPlugins({ configPath: Deno.realPathSync("./deno.json") })],
            entryPoints: ["./main.ts"],
            outfile: "./_build/main.ts",
            bundle: true,
            format: "esm",
            platform: "neutral",
            target: "esnext",
            minify: true,
            jsx: "transform",
        });
        console.log("✅ Build complete: _build/main.js");
    } catch (e) {
        console.error("❌ Build failed:", e);
        Deno.exit(1);
    } finally {
        await esbuild.stop();
    }
};

build();
