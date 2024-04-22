import semver from "semver";

import {
  getPackageInfo,
  getActiveVersion,
  args,
  step,
  publishPackage,
} from "./utils";

export const publish = async ({
  defaultPackage,
  getPkgDir,
  provenance,
  packageManager,
}: {
  defaultPackage: string;
  getPkgDir?: (pkg: string) => string;
  provenance: boolean;
  packageManager: string;
}) => {
  const tag = args._[0];

  if (!tag) throw new Error("No tag specified");

  let pkgName = defaultPackage;
  let version;

  if (tag.includes("@")) [pkgName, version] = tag.split("@");
  else version = tag;

  if (version.startsWith("v")) version = version.slice(1);

  const { pkg, pkgDir } = getPackageInfo(pkgName, getPkgDir);

  if (pkg.version !== version)
    throw new Error(
      `Package version from tag "${version}" mismatches with current version "${pkg.version}"`,
    );

  const activeVersion = await getActiveVersion(pkg.name);

  step("Publishing package...");

  const releaseTag = version.includes("beta")
    ? "beta"
    : version.includes("alpha")
      ? "alpha"
      : activeVersion && semver.lt(pkg.version, activeVersion)
        ? "previous"
        : void 0;

  await publishPackage(pkgDir, releaseTag, provenance, packageManager);
};
