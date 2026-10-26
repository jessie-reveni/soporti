import { BatchTraceProcessor, setTraceProcessors } from '@openai/agents'
import { exportSpans } from './client.js'

const MAX_QUEUE_SIZE = 200
const SCHEDULE_DELAY_MS = 1_000

export function registerLangfuseTracing() {
  const processor = new BatchTraceProcessor(
    { export: exportSpans },
    { maxQueueSize: MAX_QUEUE_SIZE, scheduleDelay: SCHEDULE_DELAY_MS }
  )

  setTraceProcessors([processor])
}
