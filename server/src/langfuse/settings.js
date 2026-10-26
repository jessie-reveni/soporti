import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const LANGFUSE_PUBLIC_KEY_KEY = 'langfuse_public_key'
export const LANGFUSE_SECRET_KEY_KEY = 'langfuse_secret_key'
export const LANGFUSE_HOST_KEY = 'langfuse_host'
export const LANGFUSE_METADATA_ONLY_KEY = 'langfuse_metadata_only'

const CACHE_TTL_MS = 60_000

let cached = null
let generation = 0

function toText(stored) {
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

async function readConfig() {
  const [publicKey, secretKey, host, metadataOnly] = await Promise.all([
    getConfigValue(LANGFUSE_PUBLIC_KEY_KEY),
    getConfigValue(LANGFUSE_SECRET_KEY_KEY),
    getConfigValue(LANGFUSE_HOST_KEY),
    getConfigValue(LANGFUSE_METADATA_ONLY_KEY),
  ])

  return {
    publicKey: toText(publicKey),
    secretKey: toText(secretKey),
    host: toText(host),
    metadataOnly: metadataOnly === true,
  }
}

export async function getLangfuseConfig() {
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const readGeneration = generation
  const value = await readConfig()
  if (readGeneration === generation) cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }

  return value
}

async function saveValue(key, value) {
  await setConfigValue(key, value)
  generation += 1
  cached = null
}

export async function setLangfusePublicKey(publicKey) {
  await saveValue(LANGFUSE_PUBLIC_KEY_KEY, publicKey)
}

export async function setLangfuseSecretKey(secretKey) {
  await saveValue(LANGFUSE_SECRET_KEY_KEY, secretKey)
}

export async function setLangfuseHost(host) {
  await saveValue(LANGFUSE_HOST_KEY, host)
}

export async function setLangfuseMetadataOnly(enabled) {
  await saveValue(LANGFUSE_METADATA_ONLY_KEY, enabled)
}

export function isLangfuseConfigured({ publicKey, secretKey, host }) {
  return Boolean(publicKey && secretKey && host)
}

export function _resetLangfuseSettingsCacheForTests() {
  cached = null
  generation = 0
}
