import { release } from '@indie-app/release-scripts'
import colors from 'picocolors'
import { logRecentCommits, run, updateTemplateVersions } from './releaseUtils'

release({
  repo: 'indie',
  packages: ['create-indie'],
  toTag: (pkg, version) =>
    pkg === 'indie' ? `v${version}` : `${pkg}@${version}`,
  logChangelog: (pkg) => logRecentCommits(pkg),
  generateChangelog: async (pkgName) => {
    if (pkgName === 'create-indie') await updateTemplateVersions()

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
    await run('npx', changelogArgs, { cwd: `packages/${pkgName}` })
  },
})