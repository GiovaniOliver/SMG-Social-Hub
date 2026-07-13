export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { PLATFORMS, PLATFORM_LABELS } from '@/types'
import type { Platform } from '@/types'
import { ConnectPlatformCard } from './connect-platform-card'

async function getConnections(brandId?: string) {
  if (!brandId) {
    return prisma.platformConnection.findMany({ where: { isActive: true } })
  }
  return prisma.platformConnection.findMany({
    where: { brandId, isActive: true },
  })
}

async function getFirstBrand() {
  return prisma.brand.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } })
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string; success?: string; error?: string }>
}) {
  const { brandId, success, error: errorParam } = await searchParams
  const brand = brandId
    ? await prisma.brand.findUnique({ where: { id: brandId } })
    : await getFirstBrand()

  const connections = brand ? await getConnections(brand.id) : []

  const connectionMap = new Map(
    connections.map((c) => [c.platform as Platform, c])
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Connect Platforms</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {brand
            ? `Managing connections for ${brand.name}`
            : 'No brand selected. Seed a brand first.'}
        </p>
      </div>

      {success && (
        <div className="mb-4 px-4 py-3 bg-green-900/50 border border-green-700 rounded-md text-green-300 text-sm">
          {success}
        </div>
      )}

      {errorParam && (
        <div className="mb-4 px-4 py-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
          {errorParam}
        </div>
      )}

      {!brand && (
        <div className="card text-center py-10">
          <p className="text-slate-400 mb-3">No brands found in the database.</p>
          <a
            href="/api/seed"
            className="btn-primary inline-block"
          >
            Seed SnapRegister brand
          </a>
        </div>
      )}

      {brand && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map((platform) => {
            const connection = connectionMap.get(platform)
            return (
              <ConnectPlatformCard
                key={platform}
                platform={platform}
                label={PLATFORM_LABELS[platform]}
                brandId={brand.id}
                connection={
                  connection
                    ? {
                        id: connection.id,
                        accountLabel: connection.accountLabel,
                        expiresAt: connection.expiresAt?.toISOString() ?? null,
                      }
                    : null
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
