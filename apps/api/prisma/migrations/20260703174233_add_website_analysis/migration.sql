-- CreateEnum
CREATE TYPE "WebsiteAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "website_analyses" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "WebsiteAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "requestedUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "statusCode" INTEGER,
    "redirectCount" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "language" TEXT,
    "faviconUrl" TEXT,
    "headings" JSONB,
    "openGraph" JSONB,
    "twitterCard" JSONB,
    "jsonLd" JSONB,
    "internalLinks" JSONB,
    "externalLinks" JSONB,
    "navigationLinks" JSONB,
    "footerLinks" JSONB,
    "images" JSONB,
    "videos" JSONB,
    "contactForms" JSONB,
    "emails" JSONB,
    "phones" JSONB,
    "socialLinks" JSONB,
    "technologies" JSONB,
    "screenshotPath" TEXT,
    "screenshotWidth" INTEGER,
    "screenshotHeight" INTEGER,
    "screenshotByteSize" INTEGER,
    "screenshotMimeType" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_analyses_businessId_idx" ON "website_analyses"("businessId");

-- CreateIndex
CREATE INDEX "website_analyses_status_idx" ON "website_analyses"("status");

-- CreateIndex
CREATE INDEX "website_analyses_createdAt_idx" ON "website_analyses"("createdAt");

-- AddForeignKey
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
