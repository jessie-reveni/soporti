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

  it('keeps balanced parentheses in markdown and bare urls', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)'

    expect(renderNoteHtml(`[x](${url})`)).toBe(`<p><a href="${url}">x</a></p>`)
    expect(renderNoteHtml(`See ${url}`)).toBe(`<p>See <a href="${url}">${url}</a></p>`)
  })

  it('leaves a closing parenthesis or bracket around a url outside the link', () => {
    expect(renderNoteHtml('(see https://a.com)')).toBe('<p>(see <a href="https://a.com">https://a.com</a>)</p>')
    expect(renderNoteHtml('[see https://a.com]')).toBe('<p>[see <a href="https://a.com">https://a.com</a>]</p>')
  })

  it('links several urls on one line', () => {
    expect(renderNoteHtml('https://a.com and https://b.com, [c](https://c.com)')).toBe(
      '<p><a href="https://a.com">https://a.com</a> and <a href="https://b.com">https://b.com</a>, <a href="https://c.com">c</a></p>'
    )
  })

  it('links a bare url immediately followed by a markdown link separately', () => {
    expect(renderNoteHtml('https://a.com[x](https://b.com)')).toBe(
      '<p><a href="https://a.com">https://a.com</a><a href="https://b.com">x</a></p>'
    )
  })

  it('links a markdown link whose label is a url', () => {
    expect(renderNoteHtml('[https://a.com](https://a.com)')).toBe('<p><a href="https://a.com">https://a.com</a></p>')
  })

  it('escapes quotes inside a markdown url', () => {
    expect(renderNoteHtml(`[x](https://a.com/?q="1"&r='2')`)).toBe(
      '<p><a href="https://a.com/?q=&quot;1&quot;&amp;r=&#39;2&#39;">x</a></p>'
    )
  })

  it('links http and uppercase schemes', () => {
    expect(renderNoteHtml('http://a.com HTTPS://B.COM')).toBe(
      '<p><a href="http://a.com">http://a.com</a> <a href="HTTPS://B.COM">HTTPS://B.COM</a></p>'
    )
  })

  it('treats three or more newlines as one paragraph break', () => {
    expect(renderNoteHtml('one\n\n\n\ntwo')).toBe('<p>one</p><p>two</p>')
  })

  it('renders empty and whitespace-only input as an empty paragraph', () => {
    expect(renderNoteHtml('')).toBe('<p></p>')
    expect(renderNoteHtml('   ')).toBe('<p></p>')
  })

  it('preserves indentation and runs of spaces', () => {
    expect(renderNoteHtml('list:\n  - one\n\n\tindented  twice')).toBe(
      '<p>list:<br>&nbsp;&nbsp;- one</p><p>&nbsp;&nbsp;&nbsp;&nbsp;indented&nbsp; twice</p>'
    )
  })
})
