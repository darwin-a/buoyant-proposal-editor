-- CreateTable
CREATE TABLE "KbDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "projectType" TEXT,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KbDocument_pkey" PRIMARY KEY ("id")
);
