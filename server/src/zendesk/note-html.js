const LINE_ENDING_RE = /\r\n?/g
const PARAGRAPH_BREAK_RE = /\n(?:[ \t]*\n)+/
const INDENT_RE = /^ */
const TAB_RE = /\t/g
const SPACE_RUN_RE = / {2,}/g
const TAB_SPACES = '    '
const LINK_RE =
  /\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()<>]|\([^\s()<>]*\))+)\)|(https?:\/\/(?:[^\s<>"'`()[\]]|\([^\s()<>"'`]*\)|\[[^\s[\]<>"'`]*\](?!\())+(?<![.,;:!?]))/gi
const HTML_ESCAPE_RE = /[&<>"']/g
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeHtml(text) {
  return text.replace(HTML_ESCAPE_RE, char => HTML_ESCAPES[char])
}

function preserveSpaces(html) {
  return html.replace(SPACE_RUN_RE, run => `${'&nbsp;'.repeat(run.length - 1)} `)
}

function renderIndent(indent) {
  return '&nbsp;'.repeat(indent.length)
}

function renderLink(label, url) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
}

function renderLine(rawLine) {
  const expanded = rawLine.replace(TAB_RE, TAB_SPACES)
  const indent = expanded.match(INDENT_RE)[0]
  const line = expanded.slice(indent.length)
  let html = ''
  let cursor = 0

  for (const match of line.matchAll(LINK_RE)) {
    const [whole, label, markdownUrl, bareUrl] = match
    html += escapeHtml(line.slice(cursor, match.index)) + renderLink(label ?? bareUrl, markdownUrl ?? bareUrl)
    cursor = match.index + whole.length
  }

  return renderIndent(indent) + preserveSpaces(html + escapeHtml(line.slice(cursor)))
}

function renderParagraph(paragraph) {
  return `<p>${paragraph.split('\n').map(renderLine).join('<br>')}</p>`
}

export function renderNoteHtml(text) {
  return text.trim().replace(LINE_ENDING_RE, '\n').split(PARAGRAPH_BREAK_RE).map(renderParagraph).join('')
}
