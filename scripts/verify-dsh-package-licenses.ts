/**
 * Enforce the MIT license declaration for repository-owned DSH npm packages.
 * @module scripts/verify-dsh-package-licenses
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DSH_PACKAGE_NAME = /^@deepseek-ai\/dsh(?:-|$)/

/**
 * Fork packages that retain their upstream license instead of the repository
 * MIT default. Integrated third-party code keeps its original license (the
 * task-suite family is Apache-2.0, the maid-atelier skin asset is
 * CC-BY-NC-SA-4.0); the value pins the exact declaration so a license change
 * must be an intentional edit here too.
 */
const LICENSE_EXCEPTIONS: Readonly<Record<string, string>> = {
  '@deepseek-ai/dsh-client-ui-aionui-panel': 'Apache-2.0',
  '@deepseek-ai/dsh-client-ui-describe-image': 'Apache-2.0',
  '@deepseek-ai/dsh-client-ui-git-graph': 'Apache-2.0',
  '@deepseek-ai/dsh-client-ui-live-stats': 'Apache-2.0',
  '@deepseek-ai/dsh-client-ui-skin-center': 'Apache-2.0',
  '@deepseek-ai/dsh-client-ui-skin-maid-atelier': 'CC-BY-NC-SA-4.0',
  '@deepseek-ai/dsh-client-ui-task-board': 'Apache-2.0',
  '@deepseek-ai/dsh-host-aionui-panel': 'Apache-2.0',
  '@deepseek-ai/dsh-host-git-graph': 'Apache-2.0',
}

/** Result of checking every DSH package reachable through the root workspace list. */
export interface DshPackageLicenseReport {
  /** Number of DSH package manifests checked. */
  packageCount: number
  /** Repository-relative diagnostics for non-MIT declarations. */
  failures: string[]
}

function readManifest(root: string, file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`verify-dsh-package-licenses: ${file} must contain a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')
}

function workspaceManifestPaths(root: string): string[] {
  const rootManifest = readManifest(root, 'package.json')
  const workspaces = rootManifest.workspaces
  if (!isStringArray(workspaces)) {
    throw new Error('verify-dsh-package-licenses: package.json workspaces must be a string array.')
  }

  const files = new Set(['package.json'])
  for (const pattern of workspaces) {
    for (const file of globSync(`${pattern}/package.json`, { cwd: root })) {
      files.add(file)
    }
  }
  return [...files].sort()
}

function printable(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

/**
 * Check every DSH npm package declared by the repository workspace.
 * @param root - absolute repository root containing the workspace package.json.
 * @returns the checked package count and every non-MIT declaration.
 */
export function inspectDshPackageLicenses(root: string): DshPackageLicenseReport {
  let packageCount = 0
  const failures: string[] = []

  for (const file of workspaceManifestPaths(root)) {
    const manifest = readManifest(root, file)
    const name = manifest.name
    if (typeof name !== 'string' || !DSH_PACKAGE_NAME.test(name)) continue

    packageCount++
    const expected = LICENSE_EXCEPTIONS[name] ?? 'MIT'
    if (manifest.license !== expected) {
      const normalizedFile = file.split(sep).join('/')
      failures.push(
        `${normalizedFile}: ${name} must declare "license": ${JSON.stringify(expected)}; found ${printable(manifest.license)}.`,
      )
    }
  }

  return { packageCount, failures }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const report = inspectDshPackageLicenses(ROOT)
  if (report.failures.length > 0) {
    process.stderr.write('verify-dsh-package-licenses: non-MIT DSH package declarations found:\n')
    for (const failure of report.failures) process.stderr.write(`  ${failure}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(
      `verify-dsh-package-licenses: ${String(report.packageCount)} DSH package(s) checked; all declare MIT.\n`,
    )
  }
}
