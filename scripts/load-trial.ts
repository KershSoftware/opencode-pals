import { pathToFileURL } from 'node:url'
import type { Character } from '../src/art/types'
import type { Preferences } from '../src/state/preferences'

type TrialMetadata = {
  character: string
  characterName: string
  bounds: Character['bounds']
  preferences: Preferences
}

/** Keep executable candidate code off the CLI's metadata stdout channel. */
export async function loadTrial(file: string): Promise<TrialMetadata> {
  let metadata: TrialMetadata | undefined
  const child = Bun.spawn([process.execPath, import.meta.path, file], {
    stdin: 'ignore', stdout: 2, stderr: 2,
    serialization: 'json',
    ipc(message) {
      if (message?.type === 'pals-trial-validation') metadata = message.metadata
    },
  })
  let deadline: ReturnType<typeof setTimeout> | undefined
  let interrupted = false
  const stop = (signal: NodeJS.Signals) => {
    interrupted = true; child.kill(signal)
    if (!deadline) deadline = setTimeout(() => child.kill('SIGKILL'), 5000)
  }
  const interrupt = () => stop('SIGINT'); const terminate = () => stop('SIGTERM')
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate)
  try {
    const exit = await child.exited
    // A result message alone is not success: deferred errors/exitCode may follow it.
    if (interrupted || exit !== 0 || !metadata) throw new Error(`Trial validation failed (exit ${exit}${!metadata ? ', no metadata returned' : ''})`)
    return metadata
  } finally {
    clearTimeout(deadline)
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate)
  }
}

if (import.meta.main) {
  try {
    if (!process.send) throw new Error('Trial validation worker requires IPC')
    // The worker inherits invoking cwd/env/privileges. This is output isolation,
    // not a sandbox; candidate code also runs again in the native trial bundle.
    const [{ validateTrial }, { catalog }, { normalizePreferences }] = await Promise.all([
      import('./native-trial'), import('../src/art/catalog'), import('../src/state/preferences'),
    ])
    const trial = validateTrial((await import(pathToFileURL(process.argv[2]!).href)).default)
    const metadata: TrialMetadata = {
      character: trial.character.id, characterName: trial.character.name, bounds: trial.character.bounds,
      preferences: normalizePreferences({ character: trial.character.id }, {
        ...catalog, characters: [trial.character, ...catalog.characters.filter(c => c.id !== trial.character.id)],
      }),
    }
    await new Promise<void>((resolve, reject) => {
      process.send!({ type: 'pals-trial-validation', metadata }, error => error ? reject(error) : resolve())
    })
  } catch (error) {
    console.error(`Pal candidate validation failed: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  } finally {
    process.disconnect?.()
  }
}
