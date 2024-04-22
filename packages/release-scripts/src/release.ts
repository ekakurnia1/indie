import prompts from "prompts";
import semver from "semver";
import colors from "picocolors";
import { publint } from "publint";
import { formatMessage } from "publint/utils";
import {
  getPackageInfo,
  getVersionChoices,
  args,
  isDryRun,
  step,
  updateVersion,
  runIfNotDry,
  run,
} from "./utils";

export const release = async ({
  repo,
  packages,
  logChangelog,
  generateChangelog,
  toTag,
  getPkgDir,
}: {
  repo: string;
  packages: string[];
  logChangelog: (pkg: string) => Promise<void>;
  generateChangelog: (pkg: string, version: string) => Promise<void>;
  toTag: (pkg: string, version: string) => string;
  getPkgDir?: (pkg: string) => string;
}) => {
  let targetVersion;

  const selectedPkg =
    packages.length === 1
      ? packages[0]
      : (
          await prompts({
            type: "select",
            name: "pkg",
            message: "Select package",
            choices: packages.map((i) => ({ value: i, title: i })),
          })
        ).pkg;

  if (!selectedPkg) return;

  await logChangelog(selectedPkg);

  const { pkg, pkgPath, pkgDir } = getPackageInfo(selectedPkg, getPkgDir);

  const { messages } = await publint({ pkgDir });

  if (messages.length) {
    for (const message of messages) console.log(formatMessage(message, pkg));

    const { yes: yes2 } = await prompts({
      type: "confirm",
      name: "yes",
      message: `${messages.length} messages from publint. Continue anyway?`,
    });

    if (!yes2) process.exit(1);
  }

  if (!targetVersion) {
    const { release: release2 } = await prompts({
      type: "select",
      name: "release",
      message: "Select release type",
      choices: getVersionChoices(pkg.version),
    });

    if (release2 === "custom") {
      const res = await prompts({
        type: "text",
        name: "version",
        message: "Input custom version",
        initial: pkg.version,
      });

      targetVersion = res.version;
    } else {
      targetVersion = release2;
    }
  }

  if (!semver.valid(targetVersion)) {
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
    message: `Releasing ${colors.yellow(tag)} Confirm?`,
  });

  if (!yes) return;

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
      colors.green(
        `
Pushed, publishing should starts shortly on CI.
https://github.com/ekakurnia1/${repo}/actions/workflows/publish.yml`,
      ),
    );
  }
  console.log();
};
