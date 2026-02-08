const MAX_IDLE_BUFFER_LENGTH = 4096

/**
 * Stateful stream parser that extracts top-level JSON objects from mixed text output.
 */
export class JsonObjectStreamParser {
  private buffer = ''
  private scanIndex = 0
  private collecting = false
  private objectStartIndex = -1
  private objectDepth = 0
  private inString = false
  private escaping = false

  /**
   * Feeds a new text chunk and returns parsed JSON objects in order.
   *
   * @param chunk Raw text chunk from stdout.
   * @returns Parsed JSON objects extracted from the current stream state.
   */
  public feed(chunk: string): readonly unknown[] {
    if (chunk.length === 0) {
      return []
    }

    this.buffer += chunk
    const parsedObjects: unknown[] = []

    for (let index = this.scanIndex; index < this.buffer.length; index += 1) {
      const character = this.buffer[index]
      if (!character) {
        continue
      }

      if (!this.collecting) {
        if (character !== '{') {
          continue
        }

        this.collecting = true
        this.objectStartIndex = index
        this.objectDepth = 1
        this.inString = false
        this.escaping = false
        continue
      }

      if (this.inString) {
        if (this.escaping) {
          this.escaping = false
          continue
        }

        if (character === '\\') {
          this.escaping = true
          continue
        }

        if (character === '"') {
          this.inString = false
        }
        continue
      }

      if (character === '"') {
        this.inString = true
        continue
      }

      if (character === '{') {
        this.objectDepth += 1
        continue
      }

      if (character === '}') {
        this.objectDepth -= 1
        if (this.objectDepth === 0) {
          const objectText = this.buffer.slice(this.objectStartIndex, index + 1)
          const parsedValue = tryParseJsonObject(objectText)
          if (parsedValue !== null) {
            parsedObjects.push(parsedValue)
          }

          this.buffer = this.buffer.slice(index + 1)
          this.scanIndex = 0
          this.collecting = false
          this.objectStartIndex = -1
          this.objectDepth = 0
          this.inString = false
          this.escaping = false
          index = -1
        }
      }
    }

    if (!this.collecting && this.buffer.length > MAX_IDLE_BUFFER_LENGTH) {
      this.buffer = this.buffer.slice(-MAX_IDLE_BUFFER_LENGTH)
      this.scanIndex = this.buffer.length
      return parsedObjects
    }

    this.scanIndex = this.buffer.length
    return parsedObjects
  }
}

const tryParseJsonObject = (value: string): unknown | null => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
