import colors from "picocolors";
import type { Options as ExecaOptions, ExecaReturnValue } from "execa";
import { execa } from "execa";
import semver from "semver";
import { release } from '../dist/index.js'

export async function run(
  bin: string,
  args: string[],
  opts: ExecaOptions = {},
): Promise<ExecaReturnValue> {
  return execa(bin, args, { stdio: "inherit", ...opts });
}

export async function getLatestTag(pkgName: string): Promise<string> {
  const tags = (await run("git", ["tag"], { stdio: "pipe" })).stdout
    .split(/\n/)
    .filter(Boolean);
  const prefix = pkgName === "indie" ? "v" : `${pkgName}@`;
  return tags
    .filter((tag) => tag.startsWith(prefix))
    .sort((a, b) =>
      semver.rcompare(a.slice(prefix.length), b.slice(prefix.length)),
    )[0];
}

export async function logRecentCommits(pkgName: string): Promise<void> {
  const tag = await getLatestTag(pkgName);
  if (!tag) return;
  const sha = await run("git", ["rev-list", "-n", "1", tag], {
    stdio: "pipe",
  }).then((res) => res.stdout.trim());
  console.log(
    colors.bold(
      `\n${colors.blue(`i`)} Commits of ${colors.green(
        pkgName,
      )} since ${colors.green(tag)} ${colors.gray(`(${sha.slice(0, 5)})`)}`,
    ),
  );
  await run(
    "git",
    [
      "--no-pager",
      "log",
      `${sha}..HEAD`,
      "--oneline",
      "--",
      `packages/${pkgName}`,
    ],
    { stdio: "inherit" },
  );
  console.log();
}

release({
  repo: '@indiejs',
  packages: ['release-scripts'],
  toTag: (pkg, version) =>
    pkg === 'indie' ? `v${version}` : `${pkg}@${version}`,
  logChangelog: (pkg) => logRecentCommits(pkg),
  generateChangelog: async (pkgName) => {
    console.log(colors.cyan('\nGenerating changelog...'))
    const changelogArgs = [
      'conventional-changelog',
      '-p',
      'angular',
      '-i',
      'CHANGELOG.md',
      '-s',
      '--commit-path',
      '.',
    ]
    if (pkgName !== 'indie') changelogArgs.push('--lerna-package', pkgName)
    await run('npx', changelogArgs, { cwd: `.` })
  },
  getPkgDir: (pkg) => `.`,
})


