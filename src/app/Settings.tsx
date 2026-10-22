import { useEffect, useRef, useState } from 'react'
import { SpeechCheck } from './SpeechCheck'
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from '../services/llm/gemini'
import { LLMError } from '../services/llm/types'
import { clearSecret, getSecret, maskSecret, setSecret, type SecretName } from '../services/secrets'
import { getModel, getSyncRepo, setModel, setSyncRepo } from '../services/settings'

function SecretField({ name, label }: { name: SecretName; label: string }) {
  const [saved, setSaved] = useState(() => getSecret(name))
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')

  const save = () => {
    if (!draft.trim()) return
    const ok = setSecret(name, draft.trim())
    setNote(ok ? '' : 'The browser refused to store this (private or blocked storage).')
    if (ok) {
      setSaved(draft.trim())
      setDraft('')
    }
  }
  const clear = () => {
    clearSecret(name)
    setSaved('')
    setNote('')
  }

  return (
    <p>
      <label>
        {label} <small>({maskSecret(saved)})</small>
        <br />
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={saved ? 'Type a new value to replace' : 'Paste here'}
          style={{ width: '100%' }}
        />
      </label>
      <button type="button" onClick={save} disabled={!draft.trim()}>
        Save
      </button>{' '}
      <button type="button" onClick={clear} disabled={!saved}>
        Clear
      </button>{' '}
      <small role="status">{note}</small>
    </p>
  )
}

export function Settings() {
  const [model, setModelState] = useState(DEFAULT_GEMINI_MODEL)
  const [repo, setRepoState] = useState('')
  const [result, setResult] = useState('')
  const [testing, setTesting] = useState(false)

  // Stored values load asynchronously; never overwrite a field the user has already edited.
  const edited = useRef({ model: false, repo: false })

  useEffect(() => {
    void getModel().then((m) => {
      if (!edited.current.model) setModelState(m)
    })
    void getSyncRepo().then((r) => {
      if (!edited.current.repo) setRepoState(r)
    })
  }, [])

  const testConnection = async () => {
    const key = getSecret('gemini')
    if (!key) {
      setResult('Save a Gemini key first.')
      return
    }
    setTesting(true)
    setResult('Testing… 0 s')
    const started = performance.now()
    const ticker = setInterval(() => setResult(`Testing… ${Math.floor((performance.now() - started) / 1000)} s`), 1000)
    try {
      await new GeminiProvider({ apiKey: key, model, timeoutMs: 15_000 }).generate({
        messages: [{ role: 'user', text: 'Reply with the single word: ok' }],
      })
      setResult(`Connected (${Math.round(performance.now() - started)} ms, model ${model}).`)
    } catch (e) {
      setResult(e instanceof LLMError ? `Failed (${e.kind}): ${e.message}` : 'Failed: unexpected error.')
    } finally {
      clearInterval(ticker)
      setTesting(false)
    }
  }

  return (
    <>
      <h2>Settings</h2>
      <h3>Gemini</h3>
      <SecretField name="gemini" label="Gemini API key" />
      <p>
        <label>
          Model ID
          <br />
          <input
            value={model}
            onChange={(e) => {
              edited.current.model = true
              setModelState(e.target.value)
            }}
            onBlur={() => void setModel(model)}
            autoCapitalize="off"
            spellCheck={false}
            style={{ width: '100%' }}
          />
        </label>
      </p>
      <p>
        <button type="button" onClick={() => void testConnection()} disabled={testing}>
          Test connection
        </button>
      </p>
      <p role="status" data-testid="test-result">
        {result}
      </p>
      <SpeechCheck />
      <h3>Sync</h3>
      <SecretField name="github" label="GitHub token (fine-grained, one repo)" />
      <p>
        <label>
          Sync repo (owner/name)
          <br />
          <input
            value={repo}
            onChange={(e) => {
              edited.current.repo = true
              setRepoState(e.target.value)
            }}
            onBlur={() => void setSyncRepo(repo)}
            autoCapitalize="off"
            spellCheck={false}
            style={{ width: '100%' }}
          />
        </label>
      </p>
    </>
  )
}
