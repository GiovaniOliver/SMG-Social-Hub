import 'server-only'

const DEFAULT_ARCADE_BASE_URL = 'https://api.arcade.dev'

export interface ArcadeAuthorizationResponse {
  id?: string
  status?: string
  url?: string
  context?: Record<string, unknown>
}

export interface ArcadeToolExecutionResponse {
  id?: string
  execution_id?: string
  status?: string
  success?: boolean
  output?: {
    authorization?: ArcadeAuthorizationResponse
    error?: {
      message?: string
      developer_message?: string
      kind?: string
      status_code?: number
    }
    value?: unknown
    logs?: Array<{ level?: string; message?: string }>
  }
}

function getArcadeApiKey(): string {
  const key = process.env.ARCADE_API_KEY?.trim()
  if (!key) throw new Error('ARCADE_API_KEY is not configured')
  return key
}

function getArcadeBaseUrl(): string {
  const configured = process.env.ARCADE_BASE_URL?.trim() || DEFAULT_ARCADE_BASE_URL
  return configured.replace(/\/+$/, '').replace(/\/v1$/, '')
}

async function arcadeRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getArcadeBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getArcadeApiKey()}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(`Arcade returned an unreadable response (HTTP ${response.status})`)
  }

  if (!response.ok) {
    const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
    const detail =
      (typeof record?.detail === 'string' && record.detail) ||
      (typeof record?.message === 'string' && record.message) ||
      (typeof record?.error === 'string' && record.error) ||
      `HTTP ${response.status}`
    throw new Error(`Arcade request failed: ${detail}`)
  }

  return data as T
}

export async function startArcadeProviderAuthorization(input: {
  userId: string
  provider: 'x' | 'reddit'
  scopes: string[]
  nextUri: string
}): Promise<ArcadeAuthorizationResponse> {
  return arcadeRequest<ArcadeAuthorizationResponse>('/v1/auth/authorize', {
    auth_requirement: {
      provider_id: input.provider,
      provider_type: 'oauth2',
      oauth2: { scopes: input.scopes },
    },
    user_id: input.userId,
    next_uri: input.nextUri,
  })
}

export async function executeArcadeTool(input: {
  toolName: string
  userId: string
  toolInput?: Record<string, unknown>
}): Promise<ArcadeToolExecutionResponse> {
  return arcadeRequest<ArcadeToolExecutionResponse>('/v1/tools/execute', {
    tool_name: input.toolName,
    input: input.toolInput || {},
    user_id: input.userId,
  })
}

export function getArcadeExecutionValue(response: ArcadeToolExecutionResponse): unknown {
  if (response.output?.error) {
    throw new Error(
      response.output.error.message ||
        response.output.error.developer_message ||
        'Arcade tool execution failed'
    )
  }

  if (response.success === false || response.status === 'error' || response.status === 'failed') {
    throw new Error('Arcade tool execution failed')
  }

  const auth = response.output?.authorization
  if (auth && auth.status !== 'completed') {
    throw new Error('Arcade authorization is not complete')
  }

  return response.output?.value
}
