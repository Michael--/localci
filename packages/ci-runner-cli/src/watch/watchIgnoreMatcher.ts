const DEFAULT_IGNORED_SEGMENTS = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'out',
  'build',
  '.tmp',
  '.vite',
  '.vite-temp',
  '.turbo',
])

const DEFAULT_IGNORED_FILE_SUFFIXES = ['.tsbuildinfo', '.tsbuildinfo.build']

type CompiledMatcher = (normalizedPath: string, segments: readonly string[]) => boolean

/**
 * Normalizes a file path to forward slashes for cross-platform matching.
 *
 * @param filePath Raw file path.
 * @returns Normalized path.
 */
export const normalizeWatchPath = (filePath: string): string => {
  return filePath.replaceAll('\\', '/')
}

/**
 * Creates a path matcher used by watch mode to suppress noisy change events.
 *
 * @param customExcludePatterns Optional config-defined exclusion patterns.
 * @returns Predicate that indicates whether a changed path should be ignored.
 */
export const createWatchIgnoreMatcher = (
  customExcludePatterns: readonly string[] = []
): ((filePath: string) => boolean) => {
  const customMatchers = customExcludePatterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
    .map(compileExcludePattern)

  return (filePath: string): boolean => {
    const normalizedPath = normalizeWatchPath(filePath)
    const segments = normalizedPath.split('/').filter((segment) => segment.length > 0)

    if (segments.some((segment) => DEFAULT_IGNORED_SEGMENTS.has(segment))) {
      return true
    }

    const fileName = segments[segments.length - 1] ?? ''
    if (DEFAULT_IGNORED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))) {
      return true
    }

    return customMatchers.some((matcher) => matcher(normalizedPath, segments))
  }
}

const compileExcludePattern = (pattern: string): CompiledMatcher => {
  const normalizedPattern = normalizeWatchPath(stripLeadingCurrentDirectory(pattern))

  if (!containsWildcard(normalizedPattern)) {
    if (normalizedPattern.includes('/')) {
      return (normalizedPath: string): boolean => {
        return (
          normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`)
        )
      }
    }

    return (_normalizedPath: string, segments: readonly string[]): boolean => {
      return segments.includes(normalizedPattern)
    }
  }

  if (!normalizedPattern.includes('/')) {
    const segmentRegex = globToRegExp(normalizedPattern)
    return (_normalizedPath: string, segments: readonly string[]): boolean => {
      return segments.some((segment) => segmentRegex.test(segment))
    }
  }

  const pathRegex = globToRegExp(normalizedPattern)
  return (normalizedPath: string): boolean => {
    return pathRegex.test(normalizedPath)
  }
}

const stripLeadingCurrentDirectory = (pattern: string): string => {
  if (pattern.startsWith('./')) {
    return pattern.slice(2)
  }

  return pattern
}

const containsWildcard = (value: string): boolean => {
  return value.includes('*')
}

const globToRegExp = (pattern: string): RegExp => {
  let regex = '^'

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (!character) {
      continue
    }

    if (character === '*') {
      const nextCharacter = pattern[index + 1]
      const afterNextCharacter = pattern[index + 2]
      if (nextCharacter === '*' && afterNextCharacter === '/') {
        regex += '(?:.*/)?'
        index += 2
        continue
      }

      if (nextCharacter === '*') {
        regex += '.*'
        index += 1
        continue
      }

      regex += '[^/]*'
      continue
    }

    regex += escapeRegExpCharacter(character)
  }

  regex += '$'
  return new RegExp(regex)
}

const escapeRegExpCharacter = (character: string): string => {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character
}
