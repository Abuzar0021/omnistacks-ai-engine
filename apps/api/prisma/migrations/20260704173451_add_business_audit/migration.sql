-- CreateEnum
CREATE TYPE "BusinessAuditStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "score" INTEGER;

-- CreateTable
CREATE TABLE "business_audits" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "websiteAnalysisId" TEXT NOT NULL,
    "status" "BusinessAuditStatus" NOT NULL DEFAULT 'PENDING',
    "promptVersion" TEXT NOT NULL DEFAULT 'business-audit-v1',
    "model" TEXT,
    "summary" TEXT,
    "findings" JSONB,
    "score" INTEGER,
    "confidence" TEXT,
    "reasons" JSONB,
    "disqualifiers" JSONB,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_audits_businessId_idx" ON "business_audits"("businessId");

-- CreateIndex
CREATE INDEX "business_audits_status_idx" ON "business_audits"("status");

-- CreateIndex
CREATE INDEX "business_audits_createdAt_idx" ON "business_audits"("createdAt");

-- CreateIndex
CREATE INDEX "businesses_score_idx" ON "businesses"("score");

-- AddForeignKey
ALTER TABLE "business_audits" ADD CONSTRAINT "business_audits_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_audits" ADD CONSTRAINT "business_audits_websiteAnalysisId_fkey" FOREIGN KEY ("websiteAnalysisId") REFERENCES "website_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
