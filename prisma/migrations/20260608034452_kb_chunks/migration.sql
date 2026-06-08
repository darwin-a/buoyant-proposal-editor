-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "attachedKbIds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "KbChunk" (
    "id" TEXT NOT NULL,
    "kbDocumentId" TEXT NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "embedding" JSONB NOT NULL,

    CONSTRAINT "KbChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KbChunk_kbDocumentId_idx" ON "KbChunk"("kbDocumentId");

-- AddForeignKey
ALTER TABLE "KbChunk" ADD CONSTRAINT "KbChunk_kbDocumentId_fkey" FOREIGN KEY ("kbDocumentId") REFERENCES "KbDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
