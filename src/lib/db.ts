/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('SUPABASE_URL is required')
  if (!supabaseSecretKey) throw new Error('SUPABASE_SECRET_KEY is required')

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }

  return adminClient
}

type Row = Record<string, any>
type QueryArgs = Record<string, any> | undefined

type ModelName =
  | 'brand'
  | 'platformConnection'
  | 'scheduledPost'
  | 'commentOpportunity'
  | 'commentDraft'
  | 'campaign'
  | 'contentPiece'
  | 'generatedContent'

type Relation = {
  model: ModelName
  type: 'one' | 'many'
  localKey: string
  foreignKey: string
}

type ModelConfig = {
  table: string
  relations: Record<string, Relation>
}

const MODEL_CONFIG = {
  brand: {
    table: 'social_hub_brands',
    relations: {
      connections: { model: 'platformConnection', type: 'many', localKey: 'id', foreignKey: 'brandId' },
      scheduledPosts: { model: 'scheduledPost', type: 'many', localKey: 'id', foreignKey: 'brandId' },
      commentOpportunities: { model: 'commentOpportunity', type: 'many', localKey: 'id', foreignKey: 'brandId' },
      campaigns: { model: 'campaign', type: 'many', localKey: 'id', foreignKey: 'brandId' },
      generatedContent: { model: 'generatedContent', type: 'many', localKey: 'id', foreignKey: 'brandId' },
    },
  },
  platformConnection: {
    table: 'social_hub_platform_connections',
    relations: {
      brand: { model: 'brand', type: 'one', localKey: 'brandId', foreignKey: 'id' },
    },
  },
  scheduledPost: {
    table: 'social_hub_scheduled_posts',
    relations: {
      brand: { model: 'brand', type: 'one', localKey: 'brandId', foreignKey: 'id' },
      contentPiece: { model: 'contentPiece', type: 'one', localKey: 'id', foreignKey: 'scheduledPostId' },
    },
  },
  commentOpportunity: {
    table: 'social_hub_comment_opportunities',
    relations: {
      brand: { model: 'brand', type: 'one', localKey: 'brandId', foreignKey: 'id' },
      drafts: { model: 'commentDraft', type: 'many', localKey: 'id', foreignKey: 'opportunityId' },
    },
  },
  commentDraft: {
    table: 'social_hub_comment_drafts',
    relations: {
      opportunity: { model: 'commentOpportunity', type: 'one', localKey: 'opportunityId', foreignKey: 'id' },
    },
  },
  campaign: {
    table: 'social_hub_campaigns',
    relations: {
      brand: { model: 'brand', type: 'one', localKey: 'brandId', foreignKey: 'id' },
      content: { model: 'contentPiece', type: 'many', localKey: 'id', foreignKey: 'campaignId' },
    },
  },
  contentPiece: {
    table: 'social_hub_content_pieces',
    relations: {
      campaign: { model: 'campaign', type: 'one', localKey: 'campaignId', foreignKey: 'id' },
      scheduledPost: { model: 'scheduledPost', type: 'one', localKey: 'scheduledPostId', foreignKey: 'id' },
    },
  },
  generatedContent: {
    table: 'social_hub_generated_content',
    relations: {
      brand: { model: 'brand', type: 'one', localKey: 'brandId', foreignKey: 'id' },
    },
  },
} as const satisfies Record<ModelName, ModelConfig>

function cleanData(model: ModelName, value: Row): Row {
  const result: Row = {}
  const relations = MODEL_CONFIG[model].relations as Record<string, Relation>

  for (const [key, raw] of Object.entries(value || {})) {
    if (raw === undefined) continue

    const relation = relations[key]
    if (relation && raw && typeof raw === 'object') {
      const relationInput = raw as Record<string, any>
      if (relation.type === 'one' && relationInput.connect) {
        const connected = relationInput.connect as Record<string, unknown>
        const connectedValue = connected[relation.foreignKey] ?? connected.id
        if (connectedValue !== undefined) result[relation.localKey] = connectedValue
      }
      continue
    }

    result[key] = raw
  }

  if (!result.id) result.id = crypto.randomUUID()
  return result
}

function comparePrimitive(actual: unknown, expected: unknown): boolean {
  if (actual instanceof Date) actual = actual.toISOString()
  if (expected instanceof Date) expected = expected.toISOString()
  return actual === expected
}

function matchesCondition(actual: any, condition: any): boolean {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) {
    return comparePrimitive(actual, condition)
  }

  for (const [operator, expected] of Object.entries(condition)) {
    switch (operator) {
      case 'equals':
        if (!comparePrimitive(actual, expected)) return false
        break
      case 'in':
        if (!(expected as unknown[]).some((item) => comparePrimitive(actual, item))) return false
        break
      case 'notIn':
        if ((expected as unknown[]).some((item) => comparePrimitive(actual, item))) return false
        break
      case 'not':
        if (matchesCondition(actual, expected)) return false
        break
      case 'gt':
        if (!(actual > expected)) return false
        break
      case 'gte':
        if (!(actual >= expected)) return false
        break
      case 'lt':
        if (!(actual < expected)) return false
        break
      case 'lte':
        if (!(actual <= expected)) return false
        break
      case 'contains':
        if (!String(actual ?? '').includes(String(expected))) return false
        break
      case 'startsWith':
        if (!String(actual ?? '').startsWith(String(expected))) return false
        break
      case 'endsWith':
        if (!String(actual ?? '').endsWith(String(expected))) return false
        break
      case 'mode':
        break
      default:
        if (!comparePrimitive((actual || {})[operator], expected)) return false
    }
  }

  return true
}

function matchesWhere(row: Row, where: any): boolean {
  if (!where || Object.keys(where).length === 0) return true

  for (const [key, condition] of Object.entries(where)) {
    if (key === 'AND') {
      const clauses = Array.isArray(condition) ? condition : [condition]
      if (!clauses.every((clause) => matchesWhere(row, clause))) return false
      continue
    }

    if (key === 'OR') {
      const clauses = Array.isArray(condition) ? condition : [condition]
      if (!clauses.some((clause) => matchesWhere(row, clause))) return false
      continue
    }

    if (key === 'NOT') {
      const clauses = Array.isArray(condition) ? condition : [condition]
      if (clauses.some((clause) => matchesWhere(row, clause))) return false
      continue
    }

    if (!matchesCondition(row[key], condition)) return false
  }

  return true
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows
  const rules = Array.isArray(orderBy) ? orderBy : [orderBy]

  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      const [field, direction] = Object.entries(rule)[0] as [string, any]
      const av = a[field]
      const bv = b[field]
      if (av === bv) continue
      const result = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1
      return direction === 'desc' ? -result : result
    }
    return 0
  })
}

function applySelect(row: Row, select: any): Row {
  if (!select) return row
  const result: Row = {}
  for (const [field, enabled] of Object.entries(select)) {
    if (enabled === true) result[field] = row[field]
  }
  return result
}

async function readAll(model: ModelName): Promise<Row[]> {
  const { data, error } = await getSupabaseAdmin().from(MODEL_CONFIG[model].table).select('*')
  if (error) throw new Error(`[database:${model}] ${error.message}`)
  return (data || []) as Row[]
}

async function hydrateRelations(model: ModelName, row: Row, include: any): Promise<Row> {
  if (!include) return row
  const result = { ...row }
  const relations = MODEL_CONFIG[model].relations as Record<string, Relation>

  for (const [relationName, relationArgsRaw] of Object.entries(include)) {
    if (!relationArgsRaw) continue
    const relation = relations[relationName]
    if (!relation) continue

    const relationArgs = relationArgsRaw === true ? {} : (relationArgsRaw as any)
    const rows = await readAll(relation.model)
    let matches = rows.filter((candidate) =>
      comparePrimitive(candidate[relation.foreignKey], row[relation.localKey])
    )

    if (relationArgs.where) matches = matches.filter((candidate) => matchesWhere(candidate, relationArgs.where))
    matches = sortRows(matches, relationArgs.orderBy)
    if (typeof relationArgs.skip === 'number') matches = matches.slice(relationArgs.skip)
    if (typeof relationArgs.take === 'number') matches = matches.slice(0, relationArgs.take)

    const mapped = await Promise.all(
      matches.map(async (candidate) => {
        let next = relationArgs.select ? applySelect(candidate, relationArgs.select) : candidate
        if (relationArgs.include) next = await hydrateRelations(relation.model, next, relationArgs.include)
        return next
      })
    )

    result[relationName] = relation.type === 'one' ? mapped[0] ?? null : mapped
  }

  return result
}

async function materialize(model: ModelName, row: Row, args: QueryArgs): Promise<Row> {
  let result = { ...row }
  if (args?.include) result = await hydrateRelations(model, result, args.include)
  if (args?.select) {
    const selected = applySelect(result, args.select)
    const relations = MODEL_CONFIG[model].relations as Record<string, Relation>
    for (const [field, selection] of Object.entries(args.select)) {
      if (!relations[field] || !selection || selection === true) continue
      const hydrated = await hydrateRelations(model, result, { [field]: selection })
      selected[field] = hydrated[field]
    }
    result = selected
  }
  return result
}

function modelAdapter(model: ModelName) {
  return {
    async count(args?: QueryArgs): Promise<number> {
      const rows = await readAll(model)
      return rows.filter((row) => matchesWhere(row, args?.where)).length
    },

    async findMany(args?: QueryArgs): Promise<Row[]> {
      let rows = (await readAll(model)).filter((row) => matchesWhere(row, args?.where))
      rows = sortRows(rows, args?.orderBy)
      if (typeof args?.skip === 'number') rows = rows.slice(args.skip)
      if (typeof args?.take === 'number') rows = rows.slice(0, args.take)
      return Promise.all(rows.map((row) => materialize(model, row, args)))
    },

    async findFirst(args?: QueryArgs): Promise<Row | null> {
      const rows = await this.findMany({ ...args, take: 1 })
      return rows[0] ?? null
    },

    async findUnique(args: QueryArgs): Promise<Row | null> {
      return this.findFirst(args)
    },

    async create(args: QueryArgs): Promise<Row> {
      const payload = cleanData(model, args?.data || {})
      const { data, error } = await getSupabaseAdmin()
        .from(MODEL_CONFIG[model].table)
        .insert(payload)
        .select('*')
        .single()
      if (error) throw new Error(`[database:${model}.create] ${error.message}`)
      return materialize(model, data as Row, args)
    },

    async createMany(args: QueryArgs): Promise<{ count: number }> {
      const values = Array.isArray(args?.data) ? args!.data : [args?.data]
      const payload = values.filter(Boolean).map((value) => cleanData(model, value))
      if (payload.length === 0) return { count: 0 }
      const { data, error } = await getSupabaseAdmin()
        .from(MODEL_CONFIG[model].table)
        .insert(payload)
        .select('id')
      if (error) {
        if (args?.skipDuplicates && /duplicate key|unique constraint/i.test(error.message)) {
          let count = 0
          for (const item of payload) {
            const { error: singleError } = await getSupabaseAdmin().from(MODEL_CONFIG[model].table).insert(item)
            if (!singleError) count += 1
            else if (!/duplicate key|unique constraint/i.test(singleError.message)) throw new Error(singleError.message)
          }
          return { count }
        }
        throw new Error(`[database:${model}.createMany] ${error.message}`)
      }
      return { count: data?.length || 0 }
    },

    async update(args: QueryArgs): Promise<Row> {
      const existing = await this.findFirst({ where: args?.where })
      if (!existing) throw new Error(`[database:${model}.update] Record not found`)
      const payload = cleanData(model, args?.data || {})
      delete payload.id
      if ('updatedAt' in existing && !('updatedAt' in payload)) payload.updatedAt = new Date().toISOString()
      const { data, error } = await getSupabaseAdmin()
        .from(MODEL_CONFIG[model].table)
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw new Error(`[database:${model}.update] ${error.message}`)
      return materialize(model, data as Row, args)
    },

    async updateMany(args: QueryArgs): Promise<{ count: number }> {
      const matches = await this.findMany({ where: args?.where })
      let count = 0
      for (const existing of matches) {
        const payload = cleanData(model, args?.data || {})
        delete payload.id
        if ('updatedAt' in existing && !('updatedAt' in payload)) payload.updatedAt = new Date().toISOString()
        const { error } = await getSupabaseAdmin()
          .from(MODEL_CONFIG[model].table)
          .update(payload)
          .eq('id', existing.id)
        if (error) throw new Error(`[database:${model}.updateMany] ${error.message}`)
        count += 1
      }
      return { count }
    },

    async delete(args: QueryArgs): Promise<Row> {
      const existing = await this.findFirst({ where: args?.where })
      if (!existing) throw new Error(`[database:${model}.delete] Record not found`)
      const { error } = await getSupabaseAdmin().from(MODEL_CONFIG[model].table).delete().eq('id', existing.id)
      if (error) throw new Error(`[database:${model}.delete] ${error.message}`)
      return existing
    },

    async deleteMany(args?: QueryArgs): Promise<{ count: number }> {
      const matches = await this.findMany({ where: args?.where })
      let count = 0
      for (const existing of matches) {
        const { error } = await getSupabaseAdmin().from(MODEL_CONFIG[model].table).delete().eq('id', existing.id)
        if (error) throw new Error(`[database:${model}.deleteMany] ${error.message}`)
        count += 1
      }
      return { count }
    },

    async upsert(args: QueryArgs): Promise<Row> {
      const existing = await this.findFirst({ where: args?.where })
      return existing
        ? this.update({ where: { id: existing.id }, data: args?.update, include: args?.include, select: args?.select })
        : this.create({ data: args?.create, include: args?.include, select: args?.select })
    },
  }
}

type ModelAdapter = ReturnType<typeof modelAdapter>
type DatabaseModels = Record<ModelName, ModelAdapter>

const adapters: DatabaseModels = {
  brand: modelAdapter('brand'),
  platformConnection: modelAdapter('platformConnection'),
  scheduledPost: modelAdapter('scheduledPost'),
  commentOpportunity: modelAdapter('commentOpportunity'),
  commentDraft: modelAdapter('commentDraft'),
  campaign: modelAdapter('campaign'),
  contentPiece: modelAdapter('contentPiece'),
  generatedContent: modelAdapter('generatedContent'),
}

async function transaction<T>(
  input: ((tx: DatabaseModels) => Promise<T>) | Promise<T>[]
): Promise<T | T[]> {
  if (typeof input === 'function') return input(adapters)
  return Promise.all(input)
}

export const db = {
  ...adapters,
  $transaction: transaction,
}

// Compatibility alias only. No Prisma package/client/engine is used by this project.
export const prisma = db

export async function databaseHealthCheck(): Promise<void> {
  const { error } = await getSupabaseAdmin().from('social_hub_brands').select('id').limit(1)
  if (error) throw new Error(error.message)
}

export type SocialHubDatabase = typeof db
export type SocialHubSupabaseClient = SupabaseClient
