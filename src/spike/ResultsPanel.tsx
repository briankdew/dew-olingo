import { useState } from 'react'
import { getEnvInfo } from './env'

interface Props {
  test: string
  results: unknown
}

export function ResultsPanel({ test, results }: Props) {
  const [copied, setCopied] = useState(false)

  const payload = JSON.stringify(
    { test, capturedAt: new Date().toISOString(), env: getEnvInfo(), results },
    null,
    2,
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section>
      <button onClick={copy}>{copied ? 'Copied' : 'Copy results'}</button>
      <pre>{payload}</pre>
    </section>
  )
}
