import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getLangfuseConfig,
  setLangfusePublicKey,
  setLangfuseSecretKey,
  setLangfuseHost,
  setLangfuseMetadataOnly,
  isLangfuseConfigured,
  LANGFUSE_PUBLIC_KEY_KEY,
  LANGFUSE_SECRET_KEY_KEY,
  LANGFUSE_HOST_KEY,
  LANGFUSE_METADATA_ONLY_KEY,
  _resetLangfuseSettingsCacheForTests,
} = await import('./settings.js')

const STORED = {
  [LANGFUSE_PUBLIC_KEY_KEY]: 'pk-lf-1',
  [LANGFUSE_SECRET_KEY_KEY]: 'sk-lf-1',
  [LANGFUSE_HOST_KEY]: 'https://cloud.langfuse.com',
  [LANGFUSE_METADATA_ONLY_KEY]: true,
}

beforeEach(() => {
  getConfigValue.mockReset().mockImplementation(async key => STORED[key] ?? null)
  setConfigValue.mockReset()
  _resetLangfuseSettingsCacheForTests()
})

describe('getLangfuseConfig', () => {
  it('returns every stored value', async () => {
    expect(await getLangfuseConfig()).toEqual({
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-1',
      host: 'https://cloud.langfuse.com',
      metadataOnly: true,
    })
  })

  it('treats empty values as unset and sends full content by default', async () => {
    getConfigValue.mockImplementation(async key => (key === LANGFUSE_METADATA_ONLY_KEY ? null : ''))

    expect(await getLangfuseConfig()).toEqual({ publicKey: null, secretKey: null, host: null, metadataOnly: false })
  })

  it('reads the database once per cache window and again once it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'))

    await getLangfuseConfig()
    await getLangfuseConfig()
    expect(getConfigValue).toHaveBeenCalledTimes(4)

    vi.setSystemTime(new Date('2026-10-26T10:01:00.001Z'))
    await getLangfuseConfig()
    expect(getConfigValue).toHaveBeenCalledTimes(8)

    vi.useRealTimers()
  })

  it('never caches a read that a save overtook, so switching to metadata only applies at once', async () => {
    const database = { ...STORED, [LANGFUSE_METADATA_ONLY_KEY]: false }
    let releaseStaleRead
    getConfigValue.mockImplementation(async key => database[key] ?? null)
    getConfigValue.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseStaleRead = () => resolve(database[LANGFUSE_PUBLIC_KEY_KEY])
        })
    )
    setConfigValue.mockImplementation(async (key, value) => {
      database[key] = value
    })

    const staleRead = getLangfuseConfig()
    await setLangfuseMetadataOnly(true)
    releaseStaleRead()

    expect((await staleRead).metadataOnly).toBe(false)
    expect((await getLangfuseConfig()).metadataOnly).toBe(true)
  })
})

describe('setters', () => {
  it.each([
    { setter: setLangfusePublicKey, key: LANGFUSE_PUBLIC_KEY_KEY, value: 'pk-lf-2' },
    { setter: setLangfuseSecretKey, key: LANGFUSE_SECRET_KEY_KEY, value: 'sk-lf-2' },
    { setter: setLangfuseHost, key: LANGFUSE_HOST_KEY, value: 'https://langfuse.internal' },
    { setter: setLangfuseMetadataOnly, key: LANGFUSE_METADATA_ONLY_KEY, value: false },
  ])('stores $key and invalidates the cache', async ({ setter, key, value }) => {
    await getLangfuseConfig()

    await setter(value)
    await getLangfuseConfig()

    expect(setConfigValue).toHaveBeenCalledWith(key, value)
    expect(getConfigValue).toHaveBeenCalledTimes(8)
  })
})

describe('isLangfuseConfigured', () => {
  it.each([
    { publicKey: 'pk', secretKey: 'sk', host: 'https://h', expected: true },
    { publicKey: null, secretKey: 'sk', host: 'https://h', expected: false },
    { publicKey: 'pk', secretKey: null, host: 'https://h', expected: false },
    { publicKey: 'pk', secretKey: 'sk', host: null, expected: false },
  ])('is $expected for public=$publicKey secret=$secretKey host=$host', ({ expected, ...config }) => {
    expect(isLangfuseConfigured(config)).toBe(expected)
  })
})
