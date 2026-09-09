-- SMG Social Hub baseline schema.
-- Database: the shared SMG Supabase/Postgres project.
-- ORM: Prisma. All Social Hub tables remain isolated by the social_hub_ prefix.

CREATE TABLE "public"."social_hub_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "voice" TEXT NOT NULL DEFAULT '{}',
    "context" TEXT NOT NULL DEFAULT '{}',
    "niche" TEXT,
    "audience" TEXT,
    "tone" TEXT,
    "goals" TEXT,
    "website" TEXT,
    "websiteContent" TEXT,
    "appStoreUrl" TEXT,
    "socialUrls" TEXT,
    "localFolderPath" TEXT,
    "brandKit" TEXT,
    "engineSettings" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_platform_connections" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT,
    "accountLabel" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_platform_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_scheduled_posts" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platforms" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT NOT NULL DEFAULT '[]',
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMPTZ(6),
    "error" TEXT,
    "results" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_scheduled_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_comment_opportunities" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "postTitle" TEXT,
    "postContent" TEXT,
    "commentId" TEXT,
    "commentText" TEXT,
    "authorName" TEXT,
    "authorHandle" TEXT,
    "isOwned" BOOLEAN NOT NULL DEFAULT false,
    "relevanceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedReply" TEXT,
    "postedAt" TIMESTAMPTZ(6),
    "discoveredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_comment_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_comment_drafts" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_comment_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_campaigns" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "analysis" TEXT NOT NULL,
    "trends" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_content_pieces" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visualPrompt" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "audioUrl" TEXT,
    "scheduledAt" TEXT,
    "keywords" TEXT,
    "performanceScore" INTEGER,
    "script" TEXT,
    "referenceImageUrl" TEXT,
    "metadata" TEXT,
    "scheduledPostId" TEXT,
    CONSTRAINT "social_hub_content_pieces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."social_hub_generated_content" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "topic" TEXT,
    "content" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "tip" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "visualPrompt" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_hub_generated_content_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_hub_brands_slug_key"
ON "public"."social_hub_brands"("slug");

CREATE UNIQUE INDEX "social_hub_platform_connections_brandId_platform_key"
ON "public"."social_hub_platform_connections"("brandId", "platform");

CREATE INDEX "social_hub_scheduled_posts_brandId_idx"
ON "public"."social_hub_scheduled_posts"("brandId");

CREATE INDEX "social_hub_scheduled_posts_status_scheduledAt_idx"
ON "public"."social_hub_scheduled_posts"("status", "scheduledAt");

CREATE UNIQUE INDEX "social_hub_comment_opportunities_dedupeKey_key"
ON "public"."social_hub_comment_opportunities"("dedupeKey");

CREATE INDEX "social_hub_comment_opportunities_brandId_status_discoveredAt_idx"
ON "public"."social_hub_comment_opportunities"("brandId", "status", "discoveredAt");

CREATE INDEX "social_hub_comment_drafts_opportunityId_idx"
ON "public"."social_hub_comment_drafts"("opportunityId");

CREATE INDEX "social_hub_campaigns_brandId_createdAt_idx"
ON "public"."social_hub_campaigns"("brandId", "createdAt");

CREATE UNIQUE INDEX "social_hub_content_pieces_scheduledPostId_key"
ON "public"."social_hub_content_pieces"("scheduledPostId");

CREATE INDEX "social_hub_content_pieces_campaignId_idx"
ON "public"."social_hub_content_pieces"("campaignId");

CREATE INDEX "social_hub_generated_content_brandId_createdAt_idx"
ON "public"."social_hub_generated_content"("brandId", "createdAt");

ALTER TABLE "public"."social_hub_platform_connections"
ADD CONSTRAINT "social_hub_platform_connections_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "public"."social_hub_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_scheduled_posts"
ADD CONSTRAINT "social_hub_scheduled_posts_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "public"."social_hub_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_comment_opportunities"
ADD CONSTRAINT "social_hub_comment_opportunities_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "public"."social_hub_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_comment_drafts"
ADD CONSTRAINT "social_hub_comment_drafts_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "public"."social_hub_comment_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_campaigns"
ADD CONSTRAINT "social_hub_campaigns_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "public"."social_hub_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_content_pieces"
ADD CONSTRAINT "social_hub_content_pieces_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "public"."social_hub_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_content_pieces"
ADD CONSTRAINT "social_hub_content_pieces_scheduledPostId_fkey"
FOREIGN KEY ("scheduledPostId") REFERENCES "public"."social_hub_scheduled_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."social_hub_generated_content"
ADD CONSTRAINT "social_hub_generated_content_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "public"."social_hub_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Internal backend tables: block direct anon/authenticated Data API access.
ALTER TABLE "public"."social_hub_brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_platform_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_scheduled_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_comment_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_comment_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_content_pieces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_hub_generated_content" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
    "public"."social_hub_brands",
    "public"."social_hub_platform_connections",
    "public"."social_hub_scheduled_posts",
    "public"."social_hub_comment_opportunities",
    "public"."social_hub_comment_drafts",
    "public"."social_hub_campaigns",
    "public"."social_hub_content_pieces",
    "public"."social_hub_generated_content"
FROM anon, authenticated;
