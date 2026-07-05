-- CreateEnum
CREATE TYPE "LeadDiscoveryJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "lead_discovery_jobs" (
    "id" TEXT NOT NULL,
    "status" "LeadDiscoveryJobStatus" NOT NULL DEFAULT 'PENDING',
    "industry" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "country" TEXT,
    "limit" INTEGER NOT NULL DEFAULT 20,
    "foundCount" INTEGER,
    "createdCount" INTEGER,
    "duplicateCount" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_discovery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_discovery_jobs_status_idx" ON "lead_discovery_jobs"("status");

-- CreateIndex
CREATE INDEX "lead_discovery_jobs_createdAt_idx" ON "lead_discovery_jobs"("createdAt");
