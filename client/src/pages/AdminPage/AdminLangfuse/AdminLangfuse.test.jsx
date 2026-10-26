import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminLangfuse from './AdminLangfuse.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet(overrides = {}) {
  const body = {
    publicKeyConfigured: false,
    secretKeyConfigured: false,
    host: '',
    metadataOnly: false,
    lastExportError: null,
    ...overrides,
  }
  return { ok: true, status: 200, json: async () => body }
}

function mockPut(body) {
  return { ok: true, status: 200, json: async () => body }
}

describe('AdminLangfuse', () => {
  it('shows the integration as configured once the host and both keys are set', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        mockGet({ publicKeyConfigured: true, secretKeyConfigured: true, host: 'https://cloud.langfuse.com' })
      )

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByText('public key configured')).toBeInTheDocument()
    expect(screen.getByText('secret key configured')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://cloud.langfuse.com')).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/langfuse')
  })

  it('stays not configured while the host is missing even with both keys', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ publicKeyConfigured: true, secretKeyConfigured: true }))

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByText('public key configured')).toBeInTheDocument()
    expect(screen.getByText('secret key configured')).toBeInTheDocument()
  })

  it.each([
    { placeholder: 'pk-lf-...', button: /save public key/i, path: 'public-key', body: { publicKey: 'lf-key-1' } },
    { placeholder: 'sk-lf-...', button: /save secret key/i, path: 'secret-key', body: { secretKey: 'lf-key-1' } },
  ])('saves the $path write-only and clears the input', async ({ placeholder, button, path, body }) => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce(mockPut({ publicKeyConfigured: true, secretKeyConfigured: true }))
    const user = userEvent.setup()

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText(placeholder)

    await user.type(input, 'lf-key-1')
    await user.click(screen.getByRole('button', { name: button }))

    await waitFor(() => expect(input).toHaveValue(''))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain(`/api/admin/config/langfuse/${path}`)
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual(body)
  })

  it('saves the host and keeps showing the value the server stored', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce(mockPut({ host: 'https://langfuse.internal' }))
    const user = userEvent.setup()

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('https://cloud.langfuse.com')

    await user.type(input, 'https://langfuse.internal/')
    await user.click(screen.getByRole('button', { name: /save host/i }))

    expect(await screen.findByDisplayValue('https://langfuse.internal')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ host: 'https://langfuse.internal/' })
  })

  it('switches to metadata only', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce(mockPut({ metadataOnly: true }))
    const user = userEvent.setup()

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)
    const toggle = await screen.findByRole('checkbox', { name: /send metadata only/i })

    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/langfuse/metadata-only')
    expect(JSON.parse(options.body)).toEqual({ enabled: true })
    expect(toggle).toBeChecked()
  })

  it.each([
    { status: 401, hint: /rejected the keys/i },
    { status: 403, hint: /rejected the keys/i },
    { status: 413, hint: /too large/i },
    { status: 404, hint: /no OpenTelemetry endpoint/i },
    { status: 0, hint: /could not be reached/i },
    { status: 502, hint: /answered with status 502/i },
  ])('explains a last export that failed with status $status', async ({ status, hint }) => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ lastExportError: { status, at: '2026-10-26T10:00:00.000Z' } }))

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(hint)).toBeInTheDocument()
    expect(screen.getByText(/the last export failed/i)).toBeInTheDocument()
  })

  it('shows no export error when the last export succeeded', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminLangfuse token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByText('public key missing')).toBeInTheDocument()
    expect(screen.queryByText(/the last export failed/i)).not.toBeInTheDocument()
  })

  it('logs out on 401 while loading', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
    const onLogout = vi.fn()

    render(<AdminLangfuse token="tok" onLogout={onLogout} />)

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })
})
