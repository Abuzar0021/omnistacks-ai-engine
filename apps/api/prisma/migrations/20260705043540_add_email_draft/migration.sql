-- CreateEnum
CREATE TYPE "EmailDraftStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "email_drafts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessAuditId" TEXT NOT NULL,
    "status" "EmailDraftStatus" NOT NULL DEFAULT 'PENDING',
    "promptVersion" TEXT NOT NULL DEFAULT 'email-personalization-v1',
    "model" TEXT,
    "subject" TEXT,
    "opener" TEXT,
    "factUsed" TEXT,
    "body" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_drafts_businessId_idx" ON "email_drafts"("businessId");

-- CreateIndex
CREATE INDEX "email_drafts_status_idx" ON "email_drafts"("status");

-- CreateIndex
CREATE INDEX "email_drafts_createdAt_idx" ON "email_drafts"("createdAt");

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_businessAuditId_fkey" FOREIGN KEY ("businessAuditId") REFERENCES "business_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
