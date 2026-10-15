const LINE_ENDING_RE = /\r\n?/g
const PARAGRAPH_BREAK_RE = /\n\s*\n/
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s()<>]+)\)|(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])/g
const HTML_ESCAPE_RE = /[&<>"']/g
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeHtml(text) {
  return text.replace(HTML_ESCAPE_RE, char => HTML_ESCAPES[char])
}

function renderLink(label, url) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
}

function renderLine(line) {
  let html = ''
  let cursor = 0

  for (const match of line.matchAll(LINK_RE)) {
    const [whole, label, markdownUrl, bareUrl] = match
    html += escapeHtml(line.slice(cursor, match.index)) + renderLink(label ?? bareUrl, markdownUrl ?? bareUrl)
    cursor = match.index + whole.length
  }

  return html + escapeHtml(line.slice(cursor))
}

function renderParagraph(paragraph) {
  return `<p>${paragraph.split('\n').map(renderLine).join('<br>')}</p>`
}

export function renderNoteHtml(text) {
  return text.replace(LINE_ENDING_RE, '\n').split(PARAGRAPH_BREAK_RE).map(renderParagraph).join('')
}
