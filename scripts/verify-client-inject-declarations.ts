/**
 * Commit-time gate for runtime inject declarations (better-harness F-2): a
 * client plugin that touches `ctx.<service>` inside `apply` without listing
 * the service in its exported `inject` array only crashes at browser boot
 * (the fiber inject gate withholds the seat). Two shipped regressions of
 * exactly this class reached runtime before being noticed (ui-aionui-panel
 * missing `slots`, ui-access-gate/ui-defaults missing `settingsScope`).
 * This verifier statically walks every first-party client package source,
 * pairs each `apply` parameter's `ctx.<member>` accesses with the file's
 * exported inject declaration, and fails loud on a member that is neither
 * declared nor a framework builtin.
 */

import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, sep } from 'node:path'
import ts from 'typescript'

const GATE = 'verify-client-inject-declarations'
const CLIENT_SOURCE_GLOB = 'packages/client/*/src/**/*.{ts,tsx}'

/**
 * Context members every plugin receives without an inject declaration:
 * cordis Context/Fiber builtins plus the timer facade verbs. Services are
 * deliberately absent — they are exactly what inject declares.
 */
export const FRAMEWORK_CONTEXT_MEMBERS: ReadonlySet<string> = new Set([
  'root', 'events', 'logger', 'reflect', 'registry', 'extend', 'isolate', 'intercept',
  'effect', 'on', 'once', 'provide', 'inject', 'get', 'plugin', 'start', 'reset', 'bail',
  'scope', 'fiber', 'collect', 'parallel', 'accept', 'emit', 'lifecycle', 'loader',
  'baseUrl', 'baseDir', 'dispose', 'onDispose', 'mount', 'unmount', 'active',
  'timeout', 'interval', 'setTimeout', 'setInterval', 'throttle', 'debounce',
])

/** One undeclared `ctx.<name>` access found in one file. */
export interface InjectViolation {
  /** Repository-relative source file. */
  readonly file: string
  /** The accessed context member missing from the inject declaration. */
  readonly name: string
  /** 1-based source line of the access. */
  readonly line: number
  /** The inject names the file actually declared. */
  readonly declared: readonly string[]
}

/** Facts one source file contributes to the gate. */
export interface InjectFacts {
  /** Names in the file's `export const inject = [...]`, or null without one. */
  readonly declared: readonly string[] | null
  /** First-parameter names of every `apply` function or method the file defines. */
  readonly applyParameters: readonly string[]
  /** Top-level property accesses on any apply parameter, in source order. */
  readonly contextUses: readonly { name: string; line: number }[]
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

/** Collect the declaration's string literals; a non-literal entry stays a loud failure downstream. */
function readInjectArray(initializer: ts.Expression): string[] | null {
  if (!ts.isArrayLiteralExpression(initializer)) return null
  const names: string[] = []
  for (const element of initializer.elements) {
    if (ts.isStringLiteral(element)) names.push(element.text)
  }
  return names
}

function applyParameterName(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction,
): string | undefined {
  const first = node.parameters[0]
  if (first !== undefined && ts.isIdentifier(first.name)) return first.name.text
  return undefined
}

/**
 * Extract one source file's inject facts.
 * @param path - File path selecting TypeScript's parser mode.
 * @param source - Source text to inspect.
 * @returns the facts, or null when the file declares no inject list.
 */
export function collectInjectFacts(path: string, source: string): InjectFacts | null {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const state: { declared: string[] | null } = { declared: null }
  const applyParameters: string[] = []

  function visit(node: ts.Node): void {
    // `export const inject = [...]` — the runtime declaration under test.
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === 'inject' && declaration.initializer !== undefined) {
          state.declared = readInjectArray(declaration.initializer)
        }
      }
    }
    // `export function apply(ctx)` / class or object method `apply(ctx)`.
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      && node.name !== undefined && ts.isIdentifier(node.name) && node.name.text === 'apply') {
      const parameter = applyParameterName(node)
      if (parameter !== undefined) applyParameters.push(parameter)
    }
    // Object-literal plugin form: `{ inject: [...], apply(ctx) { ... } }` —
    // the declaration and the apply member live on the same literal.
    if (ts.isObjectLiteralExpression(node)) {
      let literalDeclared: string[] | null = null
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue
        if (property.name.text === 'inject') {
          literalDeclared = readInjectArray(property.initializer)
        }
        if (property.name.text === 'apply') {
          if (ts.isFunctionExpression(property.initializer) || ts.isArrowFunction(property.initializer)) {
            const parameter = applyParameterName(property.initializer)
            if (parameter !== undefined) applyParameters.push(parameter)
          }
        }
      }
      if (literalDeclared !== null) {
        state.declared = state.declared === null ? literalDeclared : [...state.declared, ...literalDeclared]
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (state.declared === null) return null

  // Second pass: top-level `<applyParam>.<member>` accesses. Aliased contexts
  // and computed members escape the heuristic on purpose — the gate is a tripwire
  // for the shipped regression class, not a full data-flow analysis.
  const parameters = new Set(applyParameters)
  const contextUses: { name: string; line: number }[] = []
  function collectUses(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && parameters.has(node.expression.text)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile))
      contextUses.push({ name: node.name.text, line: line + 1 })
    }
    ts.forEachChild(node, collectUses)
  }
  collectUses(sourceFile)

  return { declared: state.declared, applyParameters, contextUses }
}

/**
 * Run the gate over every first-party client package source under one root.
 * @param root - Repository root owning `packages/client`.
 * @returns every undeclared context access, source order per file.
 */
export function verifyClientInjectDeclarations(root: string): InjectViolation[] {
  const violations: InjectViolation[] = []
  for (const path of globSync(CLIENT_SOURCE_GLOB, { cwd: root }).sort()) {
    const facts = collectInjectFacts(path, readFileSync(join(root, path), 'utf8'))
    if (facts === null || facts.declared === null) continue
    const declaredSet = new Set(facts.declared)
    for (const use of facts.contextUses) {
      if (declaredSet.has(use.name) || FRAMEWORK_CONTEXT_MEMBERS.has(use.name)) continue
      violations.push({ file: path.split(sep).join('/'), name: use.name, line: use.line, declared: facts.declared })
    }
  }
  return violations
}

/** One rendered violation line for the gate's report. */
export function renderViolation(violation: InjectViolation): string {
  return `${violation.file}:${violation.line} uses ctx.${violation.name} without declaring it (declared: [${violation.declared.join(', ')}])`
}

const directRun = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (directRun) {
  const root = join(fileURLToPath(import.meta.url), '..', '..')
  const violations = verifyClientInjectDeclarations(root)
  if (violations.length > 0) {
    console.error(`[${GATE}] undeclared runtime inject uses — add the service to the plugin's exported inject list:`)
    for (const violation of violations) console.error(`[${GATE}]   ${renderViolation(violation)}`)
    process.exit(1)
  }
  console.log(`[${GATE}] every client plugin's inject declaration covers its ctx.<service> uses`)
}
