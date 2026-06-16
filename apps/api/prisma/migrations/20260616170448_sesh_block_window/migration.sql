/*
  Warnings:

  - Added the required column `blockEndsAt` to the `Sesh` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blockStartsAt` to the `Sesh` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Sesh" ADD COLUMN     "blockEndsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "blockStartsAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Sesh_calendarId_status_blockStartsAt_blockEndsAt_idx" ON "Sesh"("calendarId", "status", "blockStartsAt", "blockEndsAt");
