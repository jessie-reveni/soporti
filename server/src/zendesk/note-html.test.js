import { describe, it, expect } from 'vitest'
import { renderNoteHtml } from './note-html.js'

describe('renderNoteHtml', () => {
  it('escapes html so a note can never inject markup', () => {
    expect(renderNoteHtml(`<script>alert(1)</script> & "x" 'y'`)).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; &#39;y&#39;</p>'
    )
  })

  it('turns a bare url into a link and leaves trailing punctuation outside it', () => {
    expect(renderNoteHtml('See https://acme.com/orders/42.')).toBe(
      '<p>See <a href="https://acme.com/orders/42">https://acme.com/orders/42</a>.</p>'
    )
  })

  it('turns a markdown link into an anchor with its label', () => {
    expect(renderNoteHtml('Open [the order](https://acme.com/orders/42) now')).toBe(
      '<p>Open <a href="https://acme.com/orders/42">the order</a> now</p>'
    )
  })

  it('escapes ampersands in the href and markup in the label', () => {
    expect(renderNoteHtml('https://acme.com/?a=1&b=2')).toBe(
      '<p><a href="https://acme.com/?a=1&amp;b=2">https://acme.com/?a=1&amp;b=2</a></p>'
    )
    expect(renderNoteHtml('[<b>x</b>](https://acme.com)')).toBe(
      '<p><a href="https://acme.com">&lt;b&gt;x&lt;/b&gt;</a></p>'
    )
  })

  it('never links a url that is not http or https', () => {
    const html = renderNoteHtml('[x](javascript:alert(1))')

    expect(html).not.toContain('<a')
    expect(html).toBe('<p>[x](javascript:alert(1))</p>')
  })

  it('keeps single line breaks as br and blank lines as paragraphs', () => {
    expect(renderNoteHtml('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>')
    expect(renderNoteHtml('one\r\ntwo\r\n\r\nthree')).toBe('<p>one<br>two</p><p>three</p>')
  })
})
