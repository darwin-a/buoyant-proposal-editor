import OpenAI from 'openai'

const PROXY_BASE = 'https://hiring-proxy.trybuoyant.ai/openai'
const MODEL = 'text-embedding-3-small'

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (client) return client
  const token = process.env.BUOYANT_PROXY_TOKEN
  if (!token) throw new Error('BUOYANT_PROXY_TOKEN is not set — cannot embed')
  client = new OpenAI({ apiKey: token, baseURL: PROXY_BASE })
  return client
}

// Embed a batch of strings. One 1536-dim vector per input, in order.
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const res = await getClient().embeddings.create({ model: MODEL, input: texts })
  return res.data.map((d) => d.embedding as number[])
}
