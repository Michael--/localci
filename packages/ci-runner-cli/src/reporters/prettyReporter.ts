import type {
  PipelineReporter,
  PipelineRunResult,
  PipelineStep,
  StepResult,
} from '../internal/core/index.js'

/** Maximum total output lines before summarization kicks in. */
const MAX_FULL_OUTPUT_LINES = 40

/** Maximum lines shown when error extraction is used. */
const MAX_ERROR_LINES = 60

/** Lines of leading context kept before each error hit. */
const ERROR_CONTEXT_LINES = 1

/**
 * Options for the pretty console reporter.
 */
export interface PrettyReporterOptions {
  /** Emits stdout/stderr also for successful steps. */
  readonly verbose: boolean
  /** ci-runner version string displayed in the start header. */
  readonly version: string
}

/**
 * Compact console reporter with failure-focused detail output.
 *
 * In non-verbose mode, failed step output is summarized:
 * - Error-relevant lines are extracted and shown.
 * - Long output is truncated with a hint to use --verbose.
 * - In verbose mode, all output is emitted unchanged.
 */
export class PrettyReporter implements PipelineReporter {
  private readonly options: PrettyReporterOptions

  /** Step id → failing project names extracted during onStepComplete. */
  private readonly failingProjects = new Map<string, readonly string[]>()

  /**
   * Creates a pretty reporter.
   *
   * @param options Reporter options.
   */
  public constructor(options: PrettyReporterOptions) {
    this.options = options
  }

  /**
   * Handles pipeline start.
   *
   * @param steps Pipeline steps.
   */
  public onPipelineStart(steps: readonly PipelineStep[]): void {
    process.stdout.write(
      colorize(`ci-runner v${this.options.version}: executing ${steps.length} steps\n`, 'blue')
    )
  }

  /**
   * Handles step start.
   *
   * @param step Current step.
   */
  public onStepStart(step: PipelineStep): void {
    process.stdout.write(colorize(`-> ${step.name}\n`, 'blue'))
  }

  /**
   * Handles step completion.
   *
   * @param result Step result.
   */
  public onStepComplete(result: StepResult): void {
    const duration = `${result.durationMs}ms`

    // Extract failing projects from the raw (unfiltered) output while
    // we have full access to it — used later in the pipeline summary.
    if (result.status === 'failed' || result.status === 'timed_out') {
      this.failingProjects.set(result.id, extractFailingProjectsFromOutput(result))
    }

    if (result.status === 'passed') {
      const metricText =
        result.metrics && typeof result.metrics.value === 'number'
          ? ` (${result.metrics.value} ${result.metrics.label})`
          : ''
      process.stdout.write(colorize(`✓ ${result.name} ${duration}${metricText}\n`, 'green'))
      if (this.options.verbose) {
        this.printFullOutput(result)
      }
      return
    }

    if (result.status === 'skipped') {
      process.stdout.write(
        colorize(
          `ℹ ${result.name} skipped (${result.reason ?? 'no reason'}, ${duration})\n`,
          'yellow'
        )
      )
      const missingScript = extractMissingScript(result)
      if (missingScript) {
        process.stdout.write(colorize(`  note: missing script "${missingScript}"\n`, 'yellow'))
        if (this.options.verbose) {
          this.printFullOutput(result)
        }
        return
      }

      this.printSmartOutput(result)
      return
    }

    process.stdout.write(
      colorize(
        `✗ ${result.name} ${result.status} (${result.reason ?? 'no reason'}, ${duration})\n`,
        'red'
      )
    )
    this.printSmartOutput(result)
  }

  /**
   * Handles pipeline completion.
   *
   * @param result Pipeline result.
   */
  public onPipelineComplete(result: PipelineRunResult): void {
    const summary = result.summary
    process.stdout.write('\n')
    process.stdout.write(
      `Summary: total=${summary.total} passed=${summary.passed} skipped=${summary.skipped} failed=${summary.failed} timedOut=${summary.timedOut} duration=${summary.durationMs}ms\n`
    )

    // Compact per-status listing with project names extracted earlier.
    const failed = result.steps.filter((s) => s.status === 'failed')
    const timedOut = result.steps.filter((s) => s.status === 'timed_out')
    const skipped = result.steps.filter((s) => s.status === 'skipped')

    if (failed.length > 0) {
      process.stdout.write(colorize(`  failed: ${this.formatStepsWithProjects(failed)}\n`, 'red'))
    }
    if (timedOut.length > 0) {
      process.stdout.write(
        colorize(`  timed_out: ${this.formatStepsWithProjects(timedOut)}\n`, 'red')
      )
    }
    if (skipped.length > 0) {
      process.stdout.write(
        colorize(`  skipped: ${skipped.map((s) => s.name).join(', ')}\n`, 'yellow')
      )
    }

    if (result.exitCode === 0) {
      process.stdout.write(colorize('Result: ✅ PASS\n', 'green'))
      return
    }

    process.stdout.write(colorize('Result: FAIL\n', 'red'))
  }

  /**
   * Formats step names with their previously extracted failing project names.
   */
  private formatStepsWithProjects(steps: readonly StepResult[]): string {
    return steps
      .map((step) => {
        const projects = this.failingProjects.get(step.id)
        if (!projects || projects.length === 0) {
          return step.name
        }

        return `${step.name} (${projects.join(', ')})`
      })
      .join(', ')
  }

  /**
   * Emits full stdout / stderr without filtering.
   *
   * @param result Step result with raw output.
   * @param filteredStdout Optional pre-filtered stdout override.
   * @param filteredStderr Optional pre-filtered stderr override.
   */
  private printFullOutput(
    result: StepResult,
    filteredStdout?: string,
    filteredStderr?: string
  ): void {
    const stdout = (filteredStdout ?? result.output.stdout).trim()
    const stderr = (filteredStderr ?? result.output.stderr).trim()

    if (stdout) {
      process.stdout.write(colorize('  stdout:\n', 'yellow'))
      process.stdout.write(indent(stdout))
      process.stdout.write('\n')
    }

    if (stderr) {
      process.stdout.write(colorize('  stderr:\n', 'yellow'))
      process.stdout.write(indent(stderr))
      process.stdout.write('\n')
    }
  }

  /**
   * Emits a concise failure summary for non-verbose mode.
   *
   * Strategy:
   * 1. Apply pnpm recursive filter for failed steps.
   * 2. If output is short enough, show it all (pre-filtered).
   * 3. Extract error-relevant lines plus brief context.
   * 4. If error extraction yields nothing, fall back to tail truncation.
   * 5. Always note how many lines were hidden when truncation occurs.
   */
  private printSmartOutput(result: StepResult): void {
    if (this.options.verbose) {
      this.printFullOutput(result)
      return
    }

    const stdout = filterFailedStepOutput(result.status, result.output.stdout)
    const stderr = filterFailedStepOutput(result.status, result.output.stderr)
    const combined = [stdout, stderr].filter((s) => s.trim().length > 0).join('\n')
    const lines = combined.split(/\r?\n/u)

    if (lines.length === 0) {
      return
    }

    // Short output: show everything (using pre-filtered stdout).
    if (lines.length <= MAX_FULL_OUTPUT_LINES) {
      this.printFullOutput(result, stdout, stderr)
      return
    }

    const isFailed = result.status === 'failed' || result.status === 'timed_out'

    // For failures, try error line extraction first.
    if (isFailed) {
      const errorLines = extractErrorLines(lines)

      if (errorLines.length > 0) {
        process.stdout.write(colorize('  failures:\n', 'red'))

        const shown = errorLines.slice(0, MAX_ERROR_LINES)
        process.stdout.write(indent(shown.join('\n')))
        process.stdout.write('\n')

        const hidden = lines.length - errorLines.length
        const truncated = errorLines.length - shown.length
        if (hidden > 0 || truncated > 0) {
          const totalHidden = hidden + truncated
          process.stdout.write(
            colorize(
              `  ... (${totalHidden} more lines not shown, use --verbose for full output)\n`,
              'yellow'
            )
          )
        }
        return
      }
    }

    // Fallback: show tail of output (error output usually trails).
    const tail = lines.slice(-Math.floor(MAX_FULL_OUTPUT_LINES * 0.75))
    process.stdout.write(
      colorize(`  output (last ${tail.length} of ${lines.length} lines):\n`, 'yellow')
    )
    process.stdout.write(indent(tail.join('\n')))
    process.stdout.write('\n')
    process.stdout.write(
      colorize(
        `  ... (${lines.length - tail.length} lines hidden, use --verbose for full output)\n`,
        'yellow'
      )
    )
  }
}

// ---------------------------------------------------------------------------
// Output filtering helpers
// ---------------------------------------------------------------------------

const filterFailedStepOutput = (status: StepResult['status'], stdout: string): string => {
  if (status !== 'failed') {
    return stdout
  }

  return filterRecursivePnpmFailureOutput(stdout)
}

const filterRecursivePnpmFailureOutput = (stdout: string): string => {
  const lines = stdout.split(/\r?\n/u)
  const hasRecursiveFailureMarker = lines.some((line) =>
    line.includes('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL')
  )
  if (!hasRecursiveFailureMarker) {
    return stdout
  }

  const failedExecutions = lines
    .map((line) => parseFailedRecursiveExecution(line))
    .filter((execution): execution is FailedRecursiveExecution => execution !== null)
  if (failedExecutions.length === 0) {
    return stdout
  }

  const failingProjectPaths = new Set(failedExecutions.map((execution) => execution.projectPath))
  const failingScriptPrefixes = new Set(
    failedExecutions.map((execution) => `${execution.projectPath} ${execution.scriptName}:`)
  )

  const filtered: string[] = []
  for (const line of lines) {
    const trimmedLine = line.trimEnd()
    if (trimmedLine.length === 0) {
      continue
    }

    const normalizedLine = trimmedLine.replaceAll('\\', '/')
    const keepLine =
      trimmedLine.startsWith('> ') ||
      trimmedLine.startsWith('Scope:') ||
      [...failingScriptPrefixes].some((prefix) => trimmedLine.startsWith(prefix)) ||
      [...failingProjectPaths].some((projectPath) =>
        lineReferencesProject(normalizedLine, projectPath)
      ) ||
      trimmedLine.includes('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL') ||
      trimmedLine.includes('ELIFECYCLE') ||
      trimmedLine.startsWith('Exit status ')

    if (keepLine) {
      filtered.push(line)
    }
  }

  return filtered.length > 0 ? filtered.join('\n') : stdout
}

interface FailedRecursiveExecution {
  readonly projectPath: string
  readonly scriptName: string
}

const parseFailedRecursiveExecution = (line: string): FailedRecursiveExecution | null => {
  const trimmedLine = line.trim()
  const match = trimmedLine.match(/^(?<projectPath>\S+)\s+(?<scriptName>[a-z0-9:_-]+):\s+Failed$/iu)
  if (!match?.groups) {
    return null
  }

  const { projectPath, scriptName } = match.groups
  if (!projectPath || !scriptName) {
    return null
  }

  return {
    projectPath,
    scriptName,
  }
}

const lineReferencesProject = (line: string, projectPath: string): boolean => {
  return (
    line.startsWith(`${projectPath}:`) ||
    line.includes(`/${projectPath}:`) ||
    line.endsWith(`/${projectPath}`) ||
    line.includes(` ${projectPath}:`)
  )
}

const indent = (text: string): string => {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}

const colorize = (text: string, color: 'red' | 'green' | 'yellow' | 'blue'): string => {
  const colors: Record<'red' | 'green' | 'yellow' | 'blue', string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
  }

  return `${colors[color]}${text}\x1b[0m`
}

const extractMissingScript = (result: StepResult): string | null => {
  const combinedOutput = `${result.output.stdout}\n${result.output.stderr}`
  const match = combinedOutput.match(/Missing script:\s*"?([a-z0-9:_-]+)"?/i)
  if (!match || !match[1]) {
    return null
  }

  return match[1]
}

// ---------------------------------------------------------------------------
// Failing project extraction — for step-level failure attribution
// ---------------------------------------------------------------------------

/**
 * Extracts failing project / package names from raw step output.
 *
 * Called during {@link PrettyReporter.onStepComplete} while the
 * unfiltered stdout/stderr is still fully available.
 *
 * Strategy:
 * 1. Parse pnpm recursive `project script: Failed` lines.
 * 2. Scan error-pattern lines for project-like path prefixes.
 *
 * @param result Step result with captured stdout/stderr.
 * @returns Deduplicated, sorted short project names.
 */
const extractFailingProjectsFromOutput = (result: StepResult): string[] => {
  const combined = `${result.output.stdout}\n${result.output.stderr}`
  const lines = combined.split(/\r?\n/u)
  const projects = new Set<string>()

  // 1. Pnpm recursive format: `project/path script: Failed`
  for (const line of lines) {
    const parsed = parseFailedRecursiveExecution(line)
    if (parsed) {
      projects.add(shortProjectName(parsed.projectPath))
    }
  }

  // 2. Scan error lines for project-like references.
  for (const line of lines) {
    if (!isSuppressedLine(line) && ERROR_LINE_PATTERNS.some((p) => p.test(line))) {
      const projectMatch = line.match(/^(?<project>[a-z0-9@][a-z0-9/._@-]*?)\s+[a-z0-9:_-]+:\s/im)
      if (projectMatch?.groups?.project) {
        const name = shortProjectName(projectMatch.groups.project)
        if (projectMatch.groups.project.includes('/')) {
          projects.add(name)
        }
      }
    }
  }

  return [...projects].sort()
}

/**
 * Returns the last path segment of a project reference.
 *
 * `packages/core` → `core`  |  `apps/test-ui` → `test-ui`
 */
const shortProjectName = (projectPath: string): string => {
  const normalized = projectPath.replaceAll('\\', '/')
  return normalized.split('/').pop() ?? normalized
}

// ---------------------------------------------------------------------------
// Error line extraction — keeps only lines that look like failures
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a line is error-relevant.
 *
 * These cover common output from linters, type checkers, test runners,
 * build tools, and Node.js runtime errors.
 */
const ERROR_LINE_PATTERNS: readonly RegExp[] = [
  // Diagnostics — generic 'error' keyword is the most reliable signal.
  // 'warning' is position-anchored (file:line:col) to avoid noise.
  /\berror\b/i,
  /[:(]\d+[,:]\d+[):]:?\s+warning\b/i,
  /^\s+\d+:\d+\s+warning\b/im,

  // Test runner failures
  /\bFAIL\b/,
  /\bfail(?:ed|ure|ing)\b/i,
  /\bassert(?:ion)?\b/i,

  // Runtime / system errors
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bSyntaxError\b/,
  /\bRangeError\b/,
  /\bEvalError\b/,
  /\bURIError\b/,
  /\bAggregateError\b/,
  /\bInternalError\b/,
  /\buncaught\b/i,
  /\bthrow(?:n|s)?\b/i,
  /\bCannot\b/,
  /\bnot\s+(?:found|defined|a\s+function|supported|allowed|permitted|installed)\b/i,

  // POSIX / Node.js error codes
  /\bERR_/,
  /\bELIFECYCLE\b/,
  /\bENOENT\b/,
  /\bEACCES\b/,
  /\bEPERM\b/,
  /\bECONNREFUSED\b/,
  /\bETIMEDOUT\b/,
  /\bENOTEMPTY\b/,
  /\bEEXIST\b/,

  // Process exit
  /\bExit status\b/i,
  /\bexited with\b/i,
  /\bnon-zero exit\b/i,

  // Build tool failures
  /\bCommand failed\b/i,
  /\bbuild failed\b/i,
  /\bcompilation failed\b/i,
  /\babort(?:ed|ing)\b/i,
  /\bpanic\b/i,

  // General failure markers
  /\bFailed\b/,
  /\bfatal\b/i,
  /\bunhandled\b/i,
  /\brejection\b/i,
  /\bsegmentation fault\b/i,
  /\bstack trace\b/i,
  /\btraceback\b/i,
]

/** Success-indicator lines that should never be treated as errors. */
const SUPPRESS_PATTERNS: readonly RegExp[] = [
  /: Done$/,
  /^\s*$/,
  /^Done\b/,
  /^> /,
  /^Scope:/,
  // Node.js runtime deprecation / configuration warnings (not build errors)
  /\(node:\d+\) Warning:/,
  /\(Use `node --trace-warnings/,
  /^\(node:\d+\)/,
  /The 'NO_COLOR' env is ignored/,
  /the 'FORCE_COLOR' env being set/,
  // Success / progress indicators
  /✓/,
  /^\s*✔/,
  // Vite / Rolldown informational warning codes (not build errors)
  /\[IMPORT_IS_UNDEFINED\]/,
  /\[INEFFECTIVE_DYNAMIC_IMPORT\]/,
  /\[CIRCULAR_DEPENDENCY\]/,
  /\[UNUSED_EXTERNAL_IMPORT\]/,
  // Build size / chunk reports
  /\bkB\b.*\bgzip\b/i,
  /dist\/assets\//,
  // Build progress / prebuild success lines
  /\bcreated .+ in \d/i,
  /\bScanning package:/i,
  /\brendering chunks/i,
  /\bbuilt in \d/i,
]

/**
 * Extracts error-relevant lines from output including brief leading context.
 *
 * Each line is tested against {@link ERROR_LINE_PATTERNS}. When a hit is
 * found, up to {@link ERROR_CONTEXT_LINES} preceding lines are also included
 * so the error is easier to understand.
 *
 * @param lines - All output lines to scan.
 * @returns Filtered lines with error context, or empty array when nothing matches.
 */
const extractErrorLines = (lines: readonly string[]): string[] => {
  const errorIndices = new Set<number>()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''

    // Skip blank lines and obvious non-error lines.
    if (line.trim().length === 0) {
      continue
    }

    if (isSuppressedLine(line)) {
      continue
    }

    if (ERROR_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      errorIndices.add(i)

      // Include brief leading context.
      for (let context = 1; context <= ERROR_CONTEXT_LINES; context += 1) {
        const ctxIndex = i - context
        if (ctxIndex >= 0 && !isSuppressedLine(lines[ctxIndex] ?? '')) {
          errorIndices.add(ctxIndex)
        }
      }
    }
  }

  if (errorIndices.size === 0) {
    return []
  }

  return [...errorIndices].sort((a, b) => a - b).map((index) => lines[index] ?? '')
}

/**
 * Checks whether a line looks like a harmless success / progress message.
 */
const isSuppressedLine = (line: string): boolean => {
  return SUPPRESS_PATTERNS.some((pattern) => pattern.test(line))
}
