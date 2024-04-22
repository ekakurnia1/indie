// src/publish.ts
import semver2 from "semver";

// src/utils.ts
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import colors from "picocolors";
import { execa } from "execa";
import semver from "semver";
import mri from "mri";
var args = mri(process.argv.slice(2));
var isDryRun = !!args.dry;
if (isDryRun) {
  console.log(colors.inverse(colors.yellow(" DRY RUN ")));
  console.log();
}
function getPackageInfo(pkgName, getPkgDir = (pkg) => `packages/${pkg}`) {
  const pkgDir = path.resolve(getPkgDir(pkgName));
  const pkgPath = path.resolve(pkgDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  if (pkg.private) {
    throw new Error(`Package ${pkgName} is private`);
  }
  return { pkg, pkgDir, pkgPath };
}
async function run(bin, args2, opts = {}) {
  return execa(bin, args2, { stdio: "inherit", ...opts });
}
async function dryRun(bin, args2, opts) {
  return console.log(
    colors.blue(`[dryrun] ${bin} ${args2.join(" ")}`),
    opts || ""
  );
}
var runIfNotDry = isDryRun ? dryRun : run;
function step(msg) {
  return console.log(colors.cyan(msg));
}
function getVersionChoices(currentVersion) {
  const currentBeta = currentVersion.includes("beta");
  const currentAlpha = currentVersion.includes("alpha");
  const isStable = !currentBeta && !currentAlpha;
  function inc(i, tag = currentAlpha ? "alpha" : "beta") {
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
function updateVersion(pkgPath, version) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}
async function publishPackage(pkgDir, tag, provenance, packageManager = "npm") {
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
async function getActiveVersion(npmName) {
  try {
    return (await run("npm", ["info", npmName, "version"], { stdio: "pipe" })).stdout;
  } catch (e) {
    if (e.stderr.startsWith("npm ERR! code E404"))
      return;
    throw e;
  }
}

// src/publish.ts
var publish = async ({
  defaultPackage,
  getPkgDir,
  provenance,
  packageManager
}) => {
  const tag = args._[0];
  if (!tag)
    throw new Error("No tag specified");
  let pkgName = defaultPackage;
  let version;
  if (tag.includes("@"))
    [pkgName, version] = tag.split("@");
  else
    version = tag;
  if (version.startsWith("v"))
    version = version.slice(1);
  const { pkg, pkgDir } = getPackageInfo(pkgName, getPkgDir);
  if (pkg.version !== version)
    throw new Error(
      `Package version from tag "${version}" mismatches with current version "${pkg.version}"`
    );
  const activeVersion = await getActiveVersion(pkg.name);
  step("Publishing package...");
  const releaseTag = version.includes("beta") ? "beta" : version.includes("alpha") ? "alpha" : activeVersion && semver2.lt(pkg.version, activeVersion) ? "previous" : void 0;
  await publishPackage(pkgDir, releaseTag, provenance, packageManager);
};

// src/release.ts
import prompts from "prompts";
import semver3 from "semver";
import colors2 from "picocolors";
import { publint } from "publint";
import { formatMessage } from "publint/utils";
var release = async ({
  repo,
  packages,
  logChangelog,
  generateChangelog,
  toTag,
  getPkgDir
}) => {
  let targetVersion;
  const selectedPkg = packages.length === 1 ? packages[0] : (await prompts({
    type: "select",
    name: "pkg",
    message: "Select package",
    choices: packages.map((i) => ({ value: i, title: i }))
  })).pkg;
  if (!selectedPkg)
    return;
  await logChangelog(selectedPkg);
  const { pkg, pkgPath, pkgDir } = getPackageInfo(selectedPkg, getPkgDir);
  const { messages } = await publint({ pkgDir });
  if (messages.length) {
    for (const message of messages)
      console.log(formatMessage(message, pkg));
    const { yes: yes2 } = await prompts({
      type: "confirm",
      name: "yes",
      message: `${messages.length} messages from publint. Continue anyway?`
    });
    if (!yes2)
      process.exit(1);
  }
  if (!targetVersion) {
    const { release: release2 } = await prompts({
      type: "select",
      name: "release",
      message: "Select release type",
      choices: getVersionChoices(pkg.version)
    });
    if (release2 === "custom") {
      const res = await prompts({
        type: "text",
        name: "version",
        message: "Input custom version",
        initial: pkg.version
      });
      targetVersion = res.version;
    } else {
      targetVersion = release2;
    }
  }
  if (!semver3.valid(targetVersion)) {
    throw new Error(`invalid target version: ${targetVersion}`);
  }
  const tag = toTag(selectedPkg, targetVersion);
  if (targetVersion.includes("beta") && !args.tag) {
    args.tag = "beta";
  }
  if (targetVersion.includes("alpha") && !args.tag) {
    args.tag = "alpha";
  }
  const { yes } = await prompts({
    type: "confirm",
    name: "yes",
    message: `Releasing ${colors2.yellow(tag)} Confirm?`
  });
  if (!yes)
    return;
  step("\nUpdating package version...");
  updateVersion(pkgPath, targetVersion);
  await generateChangelog(selectedPkg, targetVersion);
  const { stdout } = await run("git", ["diff"], { stdio: "pipe" });
  if (stdout) {
    step("\nCommitting changes...");
    await runIfNotDry("git", ["add", "-A"]);
    await runIfNotDry("git", ["commit", "-m", `release: ${tag}`]);
    await runIfNotDry("git", ["tag", tag]);
  } else {
    console.log("No changes to commit.");
    return;
  }
  step("\nPushing to GitHub...");
  await runIfNotDry("git", ["push", "origin", `refs/tags/${tag}`]);
  await runIfNotDry("git", ["push"]);
  if (isDryRun) {
    console.log(`
Dry run finished - run git diff to see package changes.`);
  } else {
    console.log(
      colors2.green(
        `
Pushed, publishing should starts shortly on CI.
https://github.com/vitejs/${repo}/actions/workflows/publish.yml`
      )
    );
  }
  console.log();
};
export {
  publish,
  release
};