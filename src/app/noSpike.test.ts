/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Built from pieces so this file does not match its own scan.
const NEEDLES = ['src/' + 'spike', '/' + 'spike/', 'spike' + '/speech']
const ROOTS = ['src', 'e2e', 'public']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('speech spike removal', () => {
  it('leaves no spike directory and no references in src, e2e or public', () => {
    const hits = ROOTS.flatMap((root) => files(root))
      .filter((f) => /\.(tsx?|html|json|js|css|webmanifest)$/.test(f))
      .filter((f) => NEEDLES.some((n) => readFileSync(f, 'utf8').includes(n)))
    expect(hits).toEqual([])
    expect(() => statSync('src/' + 'spike')).toThrow()
  })
})
