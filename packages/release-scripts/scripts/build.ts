import { rmSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { build, BuildOptions, context } from "esbuild";

import packageJSON from "../package.json";

const dev = process.argv.includes("--dev");

rmSync("dist", { force: true, recursive: true });

const buildOrWatch = async (options: BuildOptions) => {
  if (!dev) return build(options);
  const ctx = await context(options);
  await ctx.watch();
  await ctx.rebuild();
};

await buildOrWatch({
  bundle: true,
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  platform: "node",
  format: "esm",
  target: "node18",
  external: Object.keys(packageJSON.dependencies),
  plugins: [
    {
      name: "TypeScriptDeclarationsPlugin",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) return;
          execSync("tsc --emitDeclarationOnly");
        });
      },
    },
  ],
});
