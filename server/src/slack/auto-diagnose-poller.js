import config from '../config.js'
import {
  fetchList,
  fetchSchema,
  updateItemField,
  getRowId,
  fieldMap,
  toTicket,
  resolveColumnId,
  isArchived,
  getCreatedMs,
  parseListTimestamp,
} from './lists-client.js'
import { collectTicketImages } from './attachments.js'
import { diagnoseTicket } from './auto-diagnose.js'
import { getSlackBotToken } from './settings.js'

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [auto-diagnose] ${icon}`, ...args)
}

const ITEM_PENDING = 'pending'
const ITEM_SKIPPED = 'skipped'
const ITEM_UNREADABLE_DATE = 'unreadable-date'

let intervalHandle = null
const inFlight = new Set()

async function diagnoseAndWrite(client, { item, rowId, columns, diagnosisColumnId }) {
  const ticket = toTicket(item, { columns })
  const botToken = await getSlackBotToken()
  const images = await collectTicketImages(item, {
    client,
    botToken,
    maxBytes: config.autoDiagnose.maxAttachmentBytes,
  }).catch(() => [])

  log('🩺', `Diagnosing row ${rowId} — "${(ticket.title || '').slice(0, 80)}" (${images.length} image(s))`)
  const diagnosis = await diagnoseTicket(ticket, { images })
  await updateItemField(client, {
    listId: config.autoDiagnose.listId,
    rowId,
    columnId: diagnosisColumnId,
    text: diagnosis,
  })
  log('✅', `Wrote diagnosis to row ${rowId}`)
}

async function processRow(client, { item, rowId, columns, diagnosisColumnId }) {
  inFlight.add(rowId)
  try {
    await diagnoseAndWrite(client, { item, rowId, columns, diagnosisColumnId })
  } catch (err) {
    log('⚠️', `Failed to diagnose row ${rowId}: ${err.message}`)
  } finally {
    inFlight.delete(rowId)
  }
}

function parseSkipBefore(skipBefore) {
  if (!skipBefore) return { value: null }

  const value = parseListTimestamp(skipBefore)
  if (value == null) {
    return {
      error:
        `SLACK_AUTODIAGNOSE_SKIP_BEFORE="${skipBefore}" is not a valid date; ` +
        'skipping this poll to avoid diagnosing the backlog. Fix the value (ISO date or epoch).',
    }
  }

  return { value }
}

function triageCreatedDate(item, skipBeforeMs) {
  if (skipBeforeMs == null) return ITEM_PENDING

  const createdMs = getCreatedMs(item)
  if (createdMs == null) return ITEM_UNREADABLE_DATE

  return createdMs < skipBeforeMs ? ITEM_SKIPPED : ITEM_PENDING
}

function triageItem(item, { rowId, diagnosisColumnId, skipArchived, skipBeforeMs }) {
  if (!rowId) return ITEM_SKIPPED
  if (skipArchived && isArchived(item)) return ITEM_SKIPPED

  const dateStatus = triageCreatedDate(item, skipBeforeMs)
  if (dateStatus !== ITEM_PENDING) return dateStatus
  if ((fieldMap(item)[diagnosisColumnId] || '').trim()) return ITEM_SKIPPED
  if (inFlight.has(rowId)) return ITEM_SKIPPED

  return ITEM_PENDING
}

export async function runPollOnce(client) {
  const { listId, columnId, columnName, maxItemsPerPoll, skipArchived, skipBefore } = config.autoDiagnose
  const [{ items }, columns] = await Promise.all([fetchList(client, { listId }), fetchSchema(client, { listId })])

  const diagnosisColumnId = resolveColumnId(columns, { columnId, columnName })
  if (!diagnosisColumnId) {
    log(
      '⛔',
      `Could not resolve the "${columnName}" column on list ${listId}. ` +
        'Set SLACK_AUTODIAGNOSE_COLUMN_ID, or add a column with that name. Skipping this poll.'
    )
    return { processed: 0 }
  }

  const { error: skipBeforeError, value: skipBeforeMs } = parseSkipBefore(skipBefore)
  if (skipBeforeError) {
    log('⛔', skipBeforeError)
    return { processed: 0 }
  }

  let processed = 0
  let unparsedDates = 0
  for (const item of items) {
    if (processed >= maxItemsPerPoll) break

    const rowId = getRowId(item)
    const status = triageItem(item, { rowId, diagnosisColumnId, skipArchived, skipBeforeMs })
    if (status === ITEM_UNREADABLE_DATE) unparsedDates++
    if (status !== ITEM_PENDING) continue

    processed++
    await processRow(client, { item, rowId, columns, diagnosisColumnId })
  }

  if (unparsedDates > 0) {
    log('⚠️', `Skipped ${unparsedDates} item(s) with an unreadable date while SLACK_AUTODIAGNOSE_SKIP_BEFORE is set`)
  }
  return { processed }
}

export function startAutoDiagnose({ client }) {
  if (!config.autoDiagnose?.enabled) return null
  if (intervalHandle) return intervalHandle

  const { listId, pollIntervalMs } = config.autoDiagnose
  log('🩺', `Auto-diagnose enabled: polling list ${listId} every ${pollIntervalMs}ms`)

  const tick = () => {
    runPollOnce(client).catch(err => log('⚠️', `Poll failed: ${err.message}`))
  }
  intervalHandle = setInterval(tick, pollIntervalMs)
  intervalHandle.unref?.()
  tick()
  return intervalHandle
}

export function stopAutoDiagnose() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  inFlight.clear()
}
