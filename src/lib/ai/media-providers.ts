import { getProviderSecret } from './providers'

const RUNWARE_URL = 'https://api.runware.ai/v1'
const DEFAULT_IMAGE_MODEL = 'runware:100@1'
const DEFAULT_VIDEO_MODEL = 'bytedance:seedance@2.0'
const VIDEO_POLL_INTERVAL_MS = 3000
const VIDEO_POLL_TIMEOUT_MS = 120000

export interface MediaResult {
  url: string
  cost: number
}

export interface GenerateImageOptions {
  model?: string
  width?: number
  height?: number
}

export interface GenerateVideoOptions {
  model?: string
  width?: number
  height?: number
  duration?: number
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

interface RunwareTaskResult {
  taskType?: string
  taskUUID?: string
  imageURL?: string
  videoURL?: string
  status?: string
  cost?: number
  [key: string]: unknown
}

async function requireRunwareKey(): Promise<string> {
  const key = await getProviderSecret('runware')
  if (!key) throw new Error('Runware API key not configured. Go to AI Integrations.')
  return key
}

async function runwareRequest(apiKey: string, tasks: Record<string, unknown>[]): Promise<RunwareTaskResult[]> {
  const resp = await fetch(RUNWARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(tasks),
  })
  if (!resp.ok) throw new Error(`Runware error ${resp.status}: ${await resp.text()}`)
  const json = (await resp.json()) as { data?: RunwareTaskResult[]; errors?: unknown[] }
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Runware error: ${JSON.stringify(json.errors[0])}`)
  }
  return json.data ?? []
}

export async function generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<MediaResult> {
  const apiKey = await requireRunwareKey()
  const data = await runwareRequest(apiKey, [
    {
      taskType: 'imageInference',
      taskUUID: crypto.randomUUID(),
      positivePrompt: prompt,
      model: options.model ?? DEFAULT_IMAGE_MODEL,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      numberResults: 1,
    },
  ])
  const result = data[0]
  if (!result?.imageURL) throw new Error('Runware image generation returned no imageURL')
  return { url: result.imageURL, cost: typeof result.cost === 'number' ? result.cost : 0 }
}

export async function generateVideo(prompt: string, options: GenerateVideoOptions = {}): Promise<MediaResult> {
  const apiKey = await requireRunwareKey()
  const id = crypto.randomUUID()

  await runwareRequest(apiKey, [
    {
      taskType: 'videoInference',
      taskUUID: id,
      positivePrompt: prompt,
      model: options.model ?? DEFAULT_VIDEO_MODEL,
      width: options.width ?? 1280,
      height: options.height ?? 720,
      duration: options.duration ?? 5,
      numberResults: 1,
      deliveryMethod: 'async',
    },
  ])

  const pollIntervalMs = options.pollIntervalMs ?? VIDEO_POLL_INTERVAL_MS
  const pollTimeoutMs = options.pollTimeoutMs ?? VIDEO_POLL_TIMEOUT_MS
  const deadline = Date.now() + pollTimeoutMs

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const pollData = await runwareRequest(apiKey, [{ taskType: 'getResponse', taskUUID: id }])
    const status = pollData[0]
    if (status?.status === 'success') {
      if (!status.videoURL) throw new Error('Runware video generation reported success but returned no videoURL')
      return { url: status.videoURL, cost: typeof status.cost === 'number' ? status.cost : 0 }
    }
    if (status?.status === 'error') {
      throw new Error(`Runware video generation failed: ${JSON.stringify(status)}`)
    }
  }
  throw new Error('Runware video generation timed out')
}
