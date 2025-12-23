-- AlterTable
ALTER TABLE "PixKey" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
ADD COLUMN     "verificationSource" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
