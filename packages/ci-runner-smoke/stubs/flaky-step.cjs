#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const markerPath = process.argv[2]

if (!markerPath) {
  console.error('marker path is required')
  process.exit(1)
}

fs.mkdirSync(path.dirname(markerPath), { recursive: true })

const attempts = fs.existsSync(markerPath)
  ? Number.parseInt(fs.readFileSync(markerPath, 'utf8'), 10)
  : 0
const nextAttempts = Number.isNaN(attempts) ? 1 : attempts + 1

fs.writeFileSync(markerPath, String(nextAttempts), 'utf8')

if (nextAttempts < 2) {
  console.error('flaky step failed on first attempt')
  process.exit(1)
}

console.log('flaky step passed on retry')
process.exit(0)
