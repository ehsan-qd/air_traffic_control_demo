'use client'

import { useSyncExternalStore } from 'react'
import {
  DEFAULT_SETTINGS,
  type Progress,
  type Scenario,
  type Settings,
  type SolveResult,
} from './deconfliction'
import { SCENARIOS } from './scenarios'

interface DemoState {
  scenario: Scenario
  settings: Settings
  result: SolveResult | null
  progress: Progress | null
  running: boolean
  error: string | null
}
const initial: DemoState = {
  scenario: SCENARIOS[0],
  settings: DEFAULT_SETTINGS,
  result: null,
  progress: null,
  running: false,
  error: null,
}
let state = initial
let worker: Worker | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function update(patch: Partial<DemoState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useDemo() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  )
}
export function cancelSolve() {
  worker?.terminate()
  worker = null
  update({ running: false, progress: null })
}
export function selectScenario(scenario: Scenario) {
  cancelSolve()
  update({ scenario, result: null, error: null })
}
export function changeSettings(settings: Settings) {
  cancelSolve()
  update({ settings, result: null, error: null })
}
export function solve() {
  cancelSolve()
  update({
    running: true,
    result: null,
    error: null,
    progress: { phase: 'encoding', message: 'Preparing the reference model…' },
  })
  try {
    const current = new Worker(new URL('./deconfliction.worker.ts', import.meta.url))
    worker = current
    current.onmessage = (event) => {
      if (worker !== current) return
      const data = event.data
      if (data.type === 'progress') update({ progress: data.progress })
      else {
        current.terminate()
        worker = null
        if (data.type === 'result') update({ result: data.result, running: false, progress: null })
        else update({ error: data.message, running: false, progress: null })
      }
    }
    current.onerror = () => {
      if (worker === current) {
        current.terminate()
        worker = null
        update({
          running: false,
          progress: null,
          error: 'The reference worker could not run. Reload the page and try again.',
        })
      }
    }
    current.postMessage({ scenario: state.scenario, settings: state.settings })
  } catch (error) {
    update({
      running: false,
      progress: null,
      error: error instanceof Error ? error.message : 'Could not start the reference solver.',
    })
  }
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
