import { useEffect, useRef, useState } from 'react'
import { speech } from '../services/speech'
import { buildReport, runSelfTest, SAMPLE_PHRASE, summarizeSelfTest, voiceLabel, voiceUsedLine, type SelfTestRow } from '../services/speechSelfTest'
import { getVoiceURI, setVoiceURI } from '../services/settings'
import { SttError } from '../services/stt/stt'
import { sttMessage } from '../services/stt/errors'
import { formatEventList } from '../services/stt/format'
import { hasMexicanVoice, pickVoice, rankVoices, voiceId, type VoiceLike } from '../services/tts/voices'

export function SpeechCheck() {
  const [voices, setVoices] = useState<VoiceLike[]>([])
  const [allVoices, setAllVoices] = useState<VoiceLike[]>([])
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<SelfTestRow[]>([])
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [testVoice, setTestVoice] = useState<VoiceLike | undefined>()
  const [copyNote, setCopyNote] = useState('')
  const edited = useRef(false)
  const abort = useRef(new AbortController())

  useEffect(() => {
    // Strict-mode remounts reuse the ref, so start each mount with a live controller.
    abort.current = new AbortController()
    void getVoiceURI().then((v) => {
      if (!edited.current) setSaved(v)
    })
    const stopWatching = speech.tts.watchVoices((all) => {
      setAllVoices(all)
      setVoices(rankVoices(all))
    })
    return () => {
      stopWatching()
      // Leaving the screen must not leave the mic open or the self-test running on another screen.
      abort.current.abort()
      speech.stt.abortActive()
      speech.tts.cancel()
    }
  }, [])

  const voice = pickVoice(saved, voices, allVoices)

  const play = async () => {
    setBusy(true)
    setStatus('Playing…')
    try {
      await speech.tts.speak(SAMPLE_PHRASE, voice)
      setStatus('')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Speech output failed.')
    } finally {
      setBusy(false)
    }
  }

  const listen = async () => {
    setBusy(true)
    setStatus('Listening… say something.')
    try {
      const r = await speech.stt.listen()
      setStatus(`Heard: "${r.transcript}"${r.partial ? ' (cut off)' : ''}`)
    } catch (e) {
      setStatus(e instanceof SttError ? sttMessage(e.kind, 'panel') : 'Speech recognition failed.')
    } finally {
      setBusy(false)
    }
  }

  const selfTest = async () => {
    setBusy(true)
    setRunning(true)
    setFinished(false)
    setTestVoice(voice)
    setCopyNote('')
    setRows([])
    const signal = abort.current.signal
    try {
      await runSelfTest(speech, { voice, signal, prompt: setStatus, onRow: (r) => setRows((prev) => [...prev, r]) })
      if (!signal.aborted) setFinished(true)
    } finally {
      setBusy(false)
      setRunning(false)
    }
  }

  const stopTest = () => {
    // Replace the controller so a later run starts live; the old one stops the current run.
    abort.current.abort()
    abort.current = new AbortController()
    speech.stt.abortActive()
    speech.tts.cancel()
    setStatus('Test stopped.')
  }

  const copyResults = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(rows, testVoice, allVoices))
      setCopyNote('Copied.')
    } catch {
      setCopyNote('Copy failed. Select the results and copy them by hand.')
    }
  }

  const summary = summarizeSelfTest(rows)

  return (
    <>
      <h3>Speech check</h3>
      {!speech.tts.isSupported() && <p>Speech output is not available in this browser.</p>}
      {!speech.stt.isSupported() && <p>Speech recognition is not available in this browser.</p>}
      <p>
        <label>
          Voice
          <br />
          <select
            value={voice ? voiceId(voice) : ''}
            disabled={voices.length === 0 || busy}
            onChange={(e) => {
              edited.current = true
              setSaved(e.target.value)
              void setVoiceURI(e.target.value)
            }}
          >
            {voices.length === 0 && <option value="">No Spanish voices found</option>}
            {voices.map((v) => (
              <option key={voiceId(v)} value={voiceId(v)}>
                {voiceLabel(v)}
              </option>
            ))}
          </select>
        </label>
      </p>
      {voices.length > 0 && !hasMexicanVoice(voices) && (
        <p>
          <small>No es-MX voice on this device (expected on Chromebook). Using {voice?.lang}.</small>
        </p>
      )}
      <p>
        <button type="button" onClick={() => void play()} disabled={busy || !speech.tts.isSupported()}>
          Play sample
        </button>{' '}
        <button type="button" onClick={() => void listen()} disabled={busy || !speech.stt.isSupported()}>
          Listen
        </button>{' '}
      </p>
      <p>
        Self-test checks that the app can listen reliably on this device. It runs 4 short listens: Part A is two listens in a row; Part B is the app speaking a sample phrase and then listening, twice. When the screen says Listening, say a short Spanish phrase such as: hola, ¿cómo estás? Keep the volume up. It takes 1 to 2 minutes.
      </p>
      <p>
        <button type="button" onClick={() => void selfTest()} disabled={busy}>
          Self-test
        </button>{' '}
        {running && (
          <button type="button" onClick={stopTest}>
            Stop test
          </button>
        )}
      </p>
      <p role="status" data-testid="speech-status" style={running ? { fontSize: '1.4em', fontWeight: 'bold' } : undefined}>
        {status}
      </p>
      {finished && (
        <div data-testid="selftest-summary">
          <p>
            <strong>{summary.text}</strong>
            <br />
            {summary.line}
            <br />
            {voiceUsedLine(testVoice)}
          </p>
        </div>
      )}
      {finished && (
        <p>
          <button type="button" onClick={() => void copyResults()}>
            Copy results
          </button>{' '}
          {copyNote}
        </p>
      )}
      {rows.length > 0 && (
        <p>
          <small>Troubleshooting events; times are milliseconds after the mic started.</small>
        </p>
      )}
      {rows.map((r, i) => (
        <div key={i} data-testid="selftest-row">
          <strong>
            {r.label}: {r.ok ? 'pass' : 'FAIL'}
          </strong>{' '}
          {r.text}
          {r.events.length > 0 || r.ruleFired || r.endNotSeen ? (
            <pre style={{ margin: '4px 0 12px', fontSize: 12 }}>{formatEventList(r.events, r.ruleFired, r.endNotSeen).join('\n')}</pre>
          ) : null}
        </div>
      ))}
    </>
  )
}
