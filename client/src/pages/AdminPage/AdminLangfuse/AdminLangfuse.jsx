import {
  getLangfuseConfig,
  saveLangfuseHost,
  saveLangfuseMetadataOnly,
  saveLangfusePublicKey,
  saveLangfuseSecretKey,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ToggleField from '../ToggleField/ToggleField.jsx'
import ValueField from '../ValueField/ValueField.jsx'
import { formatDateTime } from '../dates.js'

const NETWORK_FAILURE_STATUS = 0
const EXPORT_ERROR_HINTS = {
  [NETWORK_FAILURE_STATUS]: 'Langfuse could not be reached (network error or timeout). Check the host.',
  401: 'Langfuse rejected the keys. Check that both belong to a project on this host.',
  403: 'Langfuse rejected the keys. Check that both belong to a project on this host.',
  404: 'The host has no OpenTelemetry endpoint. Check the host; a self-hosted Langfuse must run v3.22.0 or later.',
  413: 'The batch was too large for this Langfuse instance.',
}

function describeExportError({ status }) {
  return EXPORT_ERROR_HINTS[status] ?? `Langfuse answered with status ${status}.`
}

export default function AdminLangfuse({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getLangfuseConfig, token, onLogout)

  async function saveMetadataOnly(enabled) {
    const data = await saveLangfuseMetadataOnly(token, enabled)
    patchConfig({ metadataOnly: data.metadataOnly })
  }

  async function saveHost(value) {
    const data = await saveLangfuseHost(token, value)
    patchConfig({ host: data.host })
  }

  async function savePublicKey(value) {
    const data = await saveLangfusePublicKey(token, value)
    patchConfig({ publicKeyConfigured: data.publicKeyConfigured })
  }

  async function saveSecretKey(value) {
    const data = await saveLangfuseSecretKey(token, value)
    patchConfig({ secretKeyConfigured: data.secretKeyConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Langfuse" error={error} />

  const configured = config.publicKeyConfigured && config.secretKeyConfigured && Boolean(config.host)
  const lastError = config.lastExportError

  return (
    <>
      <AdminSection title="Langfuse tracing">
        <p className="admin__muted">
          Sends a trace of every agent run (chat, Slack, ticket auto-diagnose, scheduled queries, MCP, PR reviews and
          mentions) to Langfuse: each model call with its model and tokens, and each tool call with what it returned.
          Use it to see why an answer or a review went wrong. Works with Langfuse Cloud or a self-hosted Langfuse.
        </p>

        <StatusRow configured={configured} />
        <p className="admin__muted">Tracing starts once the host and both keys are set, without a restart.</p>

        {lastError && (
          <p className="alert alert--error">
            The last export failed ({formatDateTime(lastError.at)}). {describeExportError(lastError)}
          </p>
        )}
      </AdminSection>

      <AdminSection title="Content">
        <p className="admin__muted">
          By default a trace carries the full content: prompts, PR diffs, the conversation, and whatever the tools read
          (files, database rows, tickets, logs). Known secret formats are redacted and each value is capped, but
          everything else reaches Langfuse. Set this before the keys if only metadata may leave.
        </p>

        <ToggleField
          enabled={config.metadataOnly}
          label="Send metadata only"
          hint="Agent and tool names, models, token counts, timings and errors, without any content."
          onSave={saveMetadataOnly}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="Host">
        <p className="admin__muted">
          The base URL of your Langfuse: <code>https://cloud.langfuse.com</code> (EU),{' '}
          <code>https://us.cloud.langfuse.com</code> (US), another Cloud region, or your self-hosted instance (v3.22.0
          or later).
        </p>

        <ValueField
          savedValue={config.host}
          onSave={saveHost}
          onLogout={onLogout}
          placeholder="https://cloud.langfuse.com"
          saveLabel="Save host"
          removable
        />
      </AdminSection>

      <AdminSection title="API keys">
        <p className="admin__muted">
          In Langfuse, open the project&apos;s <strong>Settings → API Keys</strong> and create a key pair. Both are
          stored write-only and never shown again.
        </p>

        <StatusRow
          configured={config.publicKeyConfigured}
          configuredLabel="public key configured"
          unconfiguredLabel="public key missing"
        />
        <SecretField
          placeholder="pk-lf-..."
          configuredPlaceholder="Paste a new public key to replace it"
          configured={config.publicKeyConfigured}
          onSave={savePublicKey}
          onLogout={onLogout}
          saveLabel="Save public key"
          removeLabel="Remove public key"
        />

        <StatusRow
          configured={config.secretKeyConfigured}
          configuredLabel="secret key configured"
          unconfiguredLabel="secret key missing"
        />
        <SecretField
          placeholder="sk-lf-..."
          configuredPlaceholder="Paste a new secret key to replace it"
          configured={config.secretKeyConfigured}
          onSave={saveSecretKey}
          onLogout={onLogout}
          saveLabel="Save secret key"
          removeLabel="Remove secret key"
        />
      </AdminSection>
    </>
  )
}
