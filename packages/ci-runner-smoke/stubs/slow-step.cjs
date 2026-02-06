#!/usr/bin/env node

const delayMs = Number.parseInt(process.argv[2] ?? '500', 10)

setTimeout(() => {
  console.log(`slow step finished after ${delayMs}ms`)
  process.exit(0)
}, delayMs)
