import type {
  ParsedStepMetrics,
  StepOutputParser,
  StepParserResolver,
} from '../contracts/parser.js'
import type { PipelineStep, StepExecutionOutput } from '../contracts/step.js'

/**
 * In-memory parser registry with first-match resolution.
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
   * Parses output using the first matching parser.
   *
   * @param step Step definition.
   * @param output Step output payload.
   * @returns Parsed metric or null.
   */
  public parse(step: PipelineStep, output: StepExecutionOutput): ParsedStepMetrics | null {
    const parser = this.parsers.find((candidate) => candidate.matches(step))
    return parser ? parser.parse(output) : null
  }
}
