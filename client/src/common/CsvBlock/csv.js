const EXPORT_FILENAME = 'soporti-export.csv'

function endField(state) {
  state.row.push(state.field)
  state.field = ''
}

function endRow(state) {
  endField(state)
  state.rows.push(state.row)
  state.row = []
}

function readQuotedChar(state, text, index) {
  const char = text[index]
  if (char !== '"') {
    state.field += char
    return index
  }
  if (text[index + 1] === '"') {
    state.field += '"'
    return index + 1
  }

  state.inQuotes = false
  return index
}

function readChar(state, char) {
  if (char === '"') {
    state.inQuotes = true
    return
  }
  if (char === ',') {
    endField(state)
    return
  }
  if (char === '\n') {
    endRow(state)
    return
  }
  if (char !== '\r') state.field += char
}

export function parseCsv(text) {
  const state = { rows: [], row: [], field: '', inQuotes: false }

  for (let i = 0; i < text.length; i++) {
    if (state.inQuotes) {
      i = readQuotedChar(state, text, i)
      continue
    }

    readChar(state, text[i])
  }

  if (state.field !== '' || state.row.length > 0) endRow(state)

  return state.rows
}

export function downloadCsv(csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = EXPORT_FILENAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
