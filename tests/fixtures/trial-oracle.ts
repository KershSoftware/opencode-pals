import { resolve } from 'node:path'

/** Select the independent oracle only for the unchanged demonstration fixture. */
export function usesDemonstrationOracle(trial: { source?: string; sourceHash?: string; character: string }): boolean {
  return trial.source === resolve(import.meta.dir, 'trial-character.ts')
    && trial.sourceHash === 'bd54c6d22c559a59379ec2b0bce1d00f9c3a8592c6a0e5101302a2a0a7867c56'
}
