import { solveScenario } from './deconfliction'

self.onmessage = (event) => {
  try {
    const result = solveScenario(event.data.scenario, event.data.settings, (progress) =>
      self.postMessage({ type: 'progress', progress }),
    )
    self.postMessage({ type: 'result', result })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'The local solve failed.',
    })
  }
}
