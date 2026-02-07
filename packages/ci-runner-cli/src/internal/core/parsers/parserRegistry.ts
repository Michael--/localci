import type {
  ParsedStepMetrics,
  StepOutputParser,
  StepParserResolver,
} from '../contracts/parser.js'
import type { PipelineStep, StepExecutionOutput } from '../contracts/step.js'

/**
 * In-memory parser registry with ordered fallback resolution.
 */
export class StepParserRegistry implements StepParserResolver {
  private readonly parsers: StepOutputParser[]

  /**
   * Creates a parser registry.
   *
   * @param parsers Initial parser list.
   */
  public constructor(parsers: readonly StepOutputParser[] = []) {
    this.parsers = [...parsers]
  }

  /**
   * Adds a parser to the registry.
   *
   * @param parser Parser instance.
   */
  public register(parser: StepOutputParser): void {
    this.parsers.push(parser)
  }

  /**
   * Parses output using the first matching parser that returns a metric.
   *
   * @param step Step definition.
   * @param output Step output payload.
   * @returns Parsed metric or null.
   */
  public parse(step: PipelineStep, output: StepExecutionOutput): ParsedStepMetrics | null {
    for (const parser of this.parsers) {
      if (!parser.matches(step)) {
        continue
      }

      const parsed = parser.parse(output)
      if (parsed) {
        return parsed
      }
    }

    return null
  }
}
