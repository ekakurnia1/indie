import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import colors from "picocolors";
import { execa } from "execa";
import semver from "semver";
import mri from "mri";

export const args = mri(process.argv.slice(2));
export const isDryRun = !!args.dry;

if (isDryRun) {
  console.log(colors.inverse(colors.yellow(" DRY RUN ")));
  console.log();
}

export function getPackageInfo(pkgName: string, getPkgDir: (pkg: string) => string = (pkg) => `packages/${pkg}`) {
  const pkgDir = path.resolve(getPkgDir(pkgName));
  const pkgPath = path.resolve(pkgDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  if (pkg.private) {
    throw new Error(`Package ${pkgName} is private`);
  }
  return { pkg, pkgDir, pkgPath };
}

export async function run(bin: string, args2: string[], opts: any = {}) {
  return execa(bin, args2, { stdio: "inherit", ...opts });
}

async function dryRun(bin: string, args2: string[], opts?: any) {
  return console.log(
    colors.blue(`[dryrun] ${bin} ${args2.join(" ")}`),
    opts || ""
  );
}

export const runIfNotDry = isDryRun ? dryRun : run;

export function step(msg: string) {
  return console.log(colors.cyan(msg));
}

export function getVersionChoices(currentVersion: string) {
  const currentBeta = currentVersion.includes("beta");
  const currentAlpha = currentVersion.includes("alpha");
  const isStable = !currentBeta && !currentAlpha;

  function inc(i: semver.ReleaseType, tag: string = currentAlpha ? "alpha" : "beta") {
    return semver.inc(currentVersion, i, tag);
  }

  let versionChoices = [
    {
      title: "next",
      value: inc(isStable ? "patch" : "prerelease")
    }
  ];

  if (isStable) {
    versionChoices.push(
      {
        title: "beta-minor",
        value: inc("preminor")
      },
      {
        title: "beta-major",
        value: inc("premajor")
      },
      {
        title: "alpha-minor",
        value: inc("preminor", "alpha")
      },
      {
        title: "alpha-major",
        value: inc("premajor", "alpha")
      },
      {
        title: "minor",
        value: inc("minor")
      },
      {
        title: "major",
        value: inc("major")
      }
    );
  } else if (currentAlpha) {
    versionChoices.push({
      title: "beta",
      value: inc("patch") + "-beta.0"
    });
  } else {
    versionChoices.push({
      title: "stable",
      value: inc("patch")
    });
  }

  versionChoices.push({ value: "custom", title: "custom" });

  versionChoices = versionChoices.map((i) => {
    i.title = `${i.title} (${i.value})`;
    return i;
  });

  return versionChoices;
}

export function updateVersion(pkgPath: string, version: string) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function publishPackage(pkgDir: string, tag: string | undefined, provenance: boolean, packageManager: string = "npm") {
  const publicArgs = ["publish", "--access", "public"];

  if (tag) {
    publicArgs.push(`--tag`, tag);
  }

  if (provenance) {
    publicArgs.push(`--provenance`);
  }

  if (packageManager === "pnpm") {
    publicArgs.push(`--no-git-checks`);
  }

  await runIfNotDry(packageManager, publicArgs, {
    cwd: pkgDir
  });
}

export async function getActiveVersion(npmName: string) {
  try {
    return (await run("npm", ["info", npmName, "version"], { stdio: "pipe" })).stdout;
  } catch (e) {
    if (e.stderr.startsWith("npm ERR! code E404"))
      return;
    throw e;
  }
}