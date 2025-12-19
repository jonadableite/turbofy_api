-- CreateEnum
CREATE TYPE "MerchantType" AS ENUM ('PRODUCER', 'RIFEIRO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'SUPPORT', 'COPRODUCER', 'AFFILIATE', 'BUYER');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ReconciliationType" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('CREATED', 'OPENED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentInteractionType" AS ENUM ('CHARGE_CREATED', 'PIX_ISSUED', 'BOLETO_ISSUED', 'CHARGE_PAID', 'CHARGE_EXPIRED', 'CHECKOUT_SESSION_CREATED', 'ENROLLMENT_CREATED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('LIFETIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('PANDA', 'BUNNY', 'VIMEO', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "UpsellType" AS ENUM ('UPSELL', 'DOWNSELL');

-- CreateEnum
CREATE TYPE "UpsellTrigger" AS ENUM ('PAYMENT_SUCCESS', 'UPSELL_REJECTED', 'DOWNSELL_REJECTED');

-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'SETTLEMENT', 'REFUND', 'FEE');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RaffleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SOLD_OUT', 'DRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('RESERVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApiKeyOrigin" AS ENUM ('DASHBOARD', 'CLI', 'API');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "type" "MerchantType" NOT NULL DEFAULT 'PRODUCER',
    "tenantId" TEXT,
    "feePercentage" DECIMAL(65,30) NOT NULL DEFAULT 3.5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "UserRole"[] DEFAULT ARRAY['BUYER']::"UserRole"[],
    "document" TEXT NOT NULL,
    "documentType" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "kycSubmittedAt" TIMESTAMP(3),
    "kycApprovedAt" TIMESTAMP(3),
    "kycRejectedAt" TIMESTAMP(3),
    "phone" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserKycSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "UserKycSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserKycDocument" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserKycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPixKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "UserPixKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "isCredit" BOOLEAN NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 150,
    "totalDebitedCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "transferaTxId" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "transactionId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PixKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountDigit" TEXT NOT NULL,
    "branchNumber" TEXT NOT NULL,
    "branchDigit" TEXT,
    "document" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitRule" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "percentage" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "affiliateId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "description" TEXT,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "externalRef" TEXT,
    "metadata" JSONB,
    "pixQrCode" TEXT,
    "pixCopyPaste" TEXT,
    "boletoUrl" TEXT,
    "pixTxid" VARCHAR(36),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeSplit" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "percentage" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fee" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "affiliateId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "transactionId" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "ReconciliationType" NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "matches" JSONB,
    "unmatchedCharges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unmatchedTransactions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "matchedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookAttempt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "themeTokens" JSONB,
    "animations" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'CREATED',
    "returnUrl" TEXT,
    "cancelUrl" TEXT,
    "themeSnapshot" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredentials" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInteraction" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT,
    "chargeId" TEXT,
    "sessionId" TEXT,
    "type" "PaymentInteractionType" NOT NULL,
    "method" TEXT,
    "provider" TEXT,
    "amountCents" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "accessType" "AccessType" NOT NULL DEFAULT 'LIFETIME',
    "certificateText" TEXT,
    "marketplaceVisible" BOOLEAN NOT NULL DEFAULT false,
    "affiliateProgramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "affiliateCommissionPercent" INTEGER NOT NULL DEFAULT 0,
    "affiliateInviteToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCheckout" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "builderConfig" JSONB NOT NULL DEFAULT '{}',
    "themeConfig" JSONB,
    "settings" JSONB,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBump" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderBump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpsellOffer" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "type" "UpsellType" NOT NULL,
    "courseId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT,
    "amountCents" INTEGER NOT NULL,
    "triggerAfter" "UpsellTrigger" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpsellOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliation" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'PENDING',
    "commissionPercent" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoProducer" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commissionPercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoProducer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoProvider" "VideoProvider",
    "videoKey" TEXT,
    "contentHtml" TEXT,
    "downloadableFiles" JSONB,
    "position" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePrice" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "PriceType" NOT NULL DEFAULT 'ONE_TIME',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "recurrenceInterval" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" VARCHAR(500),
    "percentage" INTEGER,
    "amountCents" INTEGER,
    "maxRedemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationQr" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "builderJson" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#8B5CF6',
    "customDomain" TEXT,
    "bannerUrl" TEXT,
    "faviconUrl" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "fontFamily" TEXT,
    "theme" TEXT DEFAULT 'dark',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "commissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "affiliateId" TEXT,
    "productId" TEXT,
    "type" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "minAmountCents" INTEGER,
    "maxAmountCents" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "availableBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "pendingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "totalEarnedCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Raffle" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "prizeDescription" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "ticketPriceCents" INTEGER NOT NULL,
    "totalTickets" INTEGER NOT NULL,
    "soldTickets" INTEGER NOT NULL DEFAULT 0,
    "status" "RaffleStatus" NOT NULL DEFAULT 'DRAFT',
    "drawDate" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "winnerTicketNumber" INTEGER,
    "winnerName" TEXT,
    "winnerEmail" TEXT,
    "winnerPhone" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleTicket" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "buyerDocument" TEXT,
    "chargeId" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantProfile" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "fullName" TEXT,
    "document" TEXT,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "revenueLast12Months" TEXT,
    "projectedRevenue" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'Brasil',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantDocument" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keySuffix" TEXT NOT NULL,
    "name" TEXT,
    "origin" "ApiKeyOrigin" NOT NULL DEFAULT 'DASHBOARD',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "status" "WebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalledAt" TIMESTAMP(3),
    "lastSuccess" TIMESTAMP(3),
    "lastFailure" TIMESTAMP(3),
    "lastError" TEXT,
    "devMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "responseTime" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfeera_webhook_configs" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "object_types" TEXT[],
    "signature_secret" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT 'v1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfeera_webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_key" ON "tenants"("schema");

-- CreateIndex
CREATE INDEX "tenants_schema_idx" ON "tenants"("schema");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_document_key" ON "Merchant"("document");

-- CreateIndex
CREATE INDEX "Merchant_tenantId_idx" ON "Merchant"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_document_key" ON "User"("document");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "UserKycSubmission_userId_idx" ON "UserKycSubmission"("userId");

-- CreateIndex
CREATE INDEX "UserKycSubmission_status_idx" ON "UserKycSubmission"("status");

-- CreateIndex
CREATE INDEX "UserKycDocument_submissionId_idx" ON "UserKycDocument"("submissionId");

-- CreateIndex
CREATE INDEX "UserPixKey_userId_idx" ON "UserPixKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPixKey_userId_key" ON "UserPixKey"("userId");

-- CreateIndex
CREATE INDEX "UserLedgerEntry_userId_status_idx" ON "UserLedgerEntry"("userId", "status");

-- CreateIndex
CREATE INDEX "UserLedgerEntry_referenceId_idx" ON "UserLedgerEntry"("referenceId");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_status_idx" ON "Withdrawal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_userId_idempotencyKey_key" ON "Withdrawal"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UserOtp_userId_idx" ON "UserOtp"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_idx" ON "UserToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAttempt_email_ip_key" ON "AuthAttempt"("email", "ip");

-- CreateIndex
CREATE UNIQUE INDEX "PixKey_key_key" ON "PixKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_merchantId_key" ON "BankAccount"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_idempotencyKey_key" ON "Charge"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_externalRef_key" ON "Charge"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_pixTxid_key" ON "Charge"("pixTxid");

-- CreateIndex
CREATE INDEX "Charge_merchantId_idx" ON "Charge"("merchantId");

-- CreateIndex
CREATE INDEX "Charge_affiliateId_idx" ON "Charge"("affiliateId");

-- CreateIndex
CREATE INDEX "ChargeSplit_chargeId_idx" ON "ChargeSplit"("chargeId");

-- CreateIndex
CREATE INDEX "ChargeSplit_merchantId_idx" ON "ChargeSplit"("merchantId");

-- CreateIndex
CREATE INDEX "Fee_chargeId_idx" ON "Fee"("chargeId");

-- CreateIndex
CREATE INDEX "Settlement_merchantId_idx" ON "Settlement"("merchantId");

-- CreateIndex
CREATE INDEX "Settlement_affiliateId_idx" ON "Settlement"("affiliateId");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "Settlement_scheduledFor_idx" ON "Settlement"("scheduledFor");

-- CreateIndex
CREATE INDEX "Reconciliation_merchantId_idx" ON "Reconciliation"("merchantId");

-- CreateIndex
CREATE INDEX "Reconciliation_status_idx" ON "Reconciliation"("status");

-- CreateIndex
CREATE INDEX "Reconciliation_startDate_endDate_idx" ON "Reconciliation"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "WebhookAttempt_provider_type_status_idx" ON "WebhookAttempt"("provider", "type", "status");

-- CreateIndex
CREATE INDEX "WebhookAttempt_eventId_idx" ON "WebhookAttempt"("eventId");

-- CreateIndex
CREATE INDEX "WebhookAttempt_createdAt_idx" ON "WebhookAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutConfig_merchantId_key" ON "CheckoutConfig"("merchantId");

-- CreateIndex
CREATE INDEX "CheckoutSession_merchantId_idx" ON "CheckoutSession"("merchantId");

-- CreateIndex
CREATE INDEX "CheckoutSession_chargeId_idx" ON "CheckoutSession"("chargeId");

-- CreateIndex
CREATE INDEX "ProviderCredentials_merchantId_idx" ON "ProviderCredentials"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredentials_merchantId_provider_key" ON "ProviderCredentials"("merchantId", "provider");

-- CreateIndex
CREATE INDEX "PaymentInteraction_merchantId_type_createdAt_idx" ON "PaymentInteraction"("merchantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentInteraction_chargeId_idx" ON "PaymentInteraction"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_affiliateInviteToken_key" ON "Course"("affiliateInviteToken");

-- CreateIndex
CREATE INDEX "Course_merchantId_idx" ON "Course"("merchantId");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCheckout_slug_key" ON "ProductCheckout"("slug");

-- CreateIndex
CREATE INDEX "ProductCheckout_courseId_idx" ON "ProductCheckout"("courseId");

-- CreateIndex
CREATE INDEX "ProductCheckout_slug_idx" ON "ProductCheckout"("slug");

-- CreateIndex
CREATE INDEX "ProductCheckout_courseId_isDefault_idx" ON "ProductCheckout"("courseId", "isDefault");

-- CreateIndex
CREATE INDEX "OrderBump_checkoutId_idx" ON "OrderBump"("checkoutId");

-- CreateIndex
CREATE INDEX "OrderBump_checkoutId_active_idx" ON "OrderBump"("checkoutId", "active");

-- CreateIndex
CREATE INDEX "UpsellOffer_checkoutId_idx" ON "UpsellOffer"("checkoutId");

-- CreateIndex
CREATE INDEX "UpsellOffer_checkoutId_type_idx" ON "UpsellOffer"("checkoutId", "type");

-- CreateIndex
CREATE INDEX "UpsellOffer_checkoutId_active_idx" ON "UpsellOffer"("checkoutId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliation_referralCode_key" ON "Affiliation"("referralCode");

-- CreateIndex
CREATE INDEX "Affiliation_userId_status_idx" ON "Affiliation"("userId", "status");

-- CreateIndex
CREATE INDEX "Affiliation_courseId_status_idx" ON "Affiliation"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliation_courseId_userId_key" ON "Affiliation"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CoProducer_courseId_idx" ON "CoProducer"("courseId");

-- CreateIndex
CREATE INDEX "CoProducer_userId_idx" ON "CoProducer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CoProducer_courseId_userId_key" ON "CoProducer"("courseId", "userId");

-- CreateIndex
CREATE INDEX "Module_courseId_idx" ON "Module"("courseId");

-- CreateIndex
CREATE INDEX "Module_courseId_position_idx" ON "Module"("courseId", "position");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_idx" ON "Lesson"("moduleId");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_position_idx" ON "Lesson"("moduleId", "position");

-- CreateIndex
CREATE INDEX "CoursePrice_courseId_idx" ON "CoursePrice"("courseId");

-- CreateIndex
CREATE INDEX "CoursePrice_courseId_active_idx" ON "CoursePrice"("courseId", "active");

-- CreateIndex
CREATE INDEX "Coupon_courseId_idx" ON "Coupon"("courseId");

-- CreateIndex
CREATE INDEX "Coupon_code_active_idx" ON "Coupon"("code", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_courseId_code_key" ON "Coupon"("courseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_chargeId_key" ON "Enrollment"("chargeId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_idx" ON "Enrollment"("userId");

-- CreateIndex
CREATE INDEX "Enrollment_chargeId_idx" ON "Enrollment"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_chargeId_key" ON "Enrollment"("userId", "courseId", "chargeId");

-- CreateIndex
CREATE INDEX "LessonProgress_enrollmentId_idx" ON "LessonProgress"("enrollmentId");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_enrollmentId_lessonId_key" ON "LessonProgress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "Certificate_enrollmentId_idx" ON "Certificate"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPage_slug_key" ON "SalesPage"("slug");

-- CreateIndex
CREATE INDEX "SalesPage_courseId_idx" ON "SalesPage"("courseId");

-- CreateIndex
CREATE INDEX "SalesPage_slug_idx" ON "SalesPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DomainConfig_merchantId_key" ON "DomainConfig"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainConfig_customDomain_key" ON "DomainConfig"("customDomain");

-- CreateIndex
CREATE INDEX "DomainConfig_merchantId_idx" ON "DomainConfig"("merchantId");

-- CreateIndex
CREATE INDEX "DomainConfig_customDomain_idx" ON "DomainConfig"("customDomain");

-- CreateIndex
CREATE INDEX "Affiliate_merchantId_idx" ON "Affiliate"("merchantId");

-- CreateIndex
CREATE INDEX "Affiliate_merchantId_active_idx" ON "Affiliate"("merchantId", "active");

-- CreateIndex
CREATE INDEX "Affiliate_email_idx" ON "Affiliate"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_idx" ON "AffiliateLink"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateLink_productId_idx" ON "AffiliateLink"("productId");

-- CreateIndex
CREATE INDEX "AffiliateLink_code_idx" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_productId_idx" ON "AffiliateLink"("affiliateId", "productId");

-- CreateIndex
CREATE INDEX "CommissionRule_merchantId_idx" ON "CommissionRule"("merchantId");

-- CreateIndex
CREATE INDEX "CommissionRule_merchantId_active_idx" ON "CommissionRule"("merchantId", "active");

-- CreateIndex
CREATE INDEX "CommissionRule_affiliateId_idx" ON "CommissionRule"("affiliateId");

-- CreateIndex
CREATE INDEX "CommissionRule_productId_idx" ON "CommissionRule"("productId");

-- CreateIndex
CREATE INDEX "CommissionRule_merchantId_priority_idx" ON "CommissionRule"("merchantId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_merchantId_key" ON "Wallet"("merchantId");

-- CreateIndex
CREATE INDEX "Wallet_merchantId_idx" ON "Wallet"("merchantId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_type_idx" ON "WalletTransaction"("walletId", "type");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_status_idx" ON "WalletTransaction"("walletId", "status");

-- CreateIndex
CREATE INDEX "WalletTransaction_referenceId_idx" ON "WalletTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "Raffle_merchantId_idx" ON "Raffle"("merchantId");

-- CreateIndex
CREATE INDEX "Raffle_merchantId_status_idx" ON "Raffle"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Raffle_status_idx" ON "Raffle"("status");

-- CreateIndex
CREATE INDEX "Raffle_drawDate_idx" ON "Raffle"("drawDate");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleTicket_chargeId_key" ON "RaffleTicket"("chargeId");

-- CreateIndex
CREATE INDEX "RaffleTicket_raffleId_idx" ON "RaffleTicket"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleTicket_raffleId_status_idx" ON "RaffleTicket"("raffleId", "status");

-- CreateIndex
CREATE INDEX "RaffleTicket_chargeId_idx" ON "RaffleTicket"("chargeId");

-- CreateIndex
CREATE INDEX "RaffleTicket_buyerEmail_idx" ON "RaffleTicket"("buyerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleTicket_raffleId_ticketNumber_key" ON "RaffleTicket"("raffleId", "ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_merchantId_key" ON "MerchantProfile"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_document_key" ON "MerchantProfile"("document");

-- CreateIndex
CREATE INDEX "MerchantDocument_merchantId_idx" ON "MerchantDocument"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantDocument_merchantId_type_key" ON "MerchantDocument"("merchantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_idx" ON "ApiKey"("merchantId");

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_revokedAt_idx" ON "ApiKey"("merchantId", "revokedAt");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_publicId_key" ON "Webhook"("publicId");

-- CreateIndex
CREATE INDEX "Webhook_merchantId_idx" ON "Webhook"("merchantId");

-- CreateIndex
CREATE INDEX "Webhook_merchantId_status_idx" ON "Webhook"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Webhook_publicId_idx" ON "Webhook"("publicId");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_idx" ON "WebhookLog"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_createdAt_idx" ON "WebhookLog"("webhookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transfeera_webhook_configs_webhook_id_key" ON "transfeera_webhook_configs"("webhook_id");

-- CreateIndex
CREATE INDEX "transfeera_webhook_configs_merchant_id_idx" ON "transfeera_webhook_configs"("merchant_id");

-- CreateIndex
CREATE INDEX "transfeera_webhook_configs_webhook_id_idx" ON "transfeera_webhook_configs"("webhook_id");

-- CreateIndex
CREATE INDEX "transfeera_webhook_configs_account_id_idx" ON "transfeera_webhook_configs"("account_id");

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserKycSubmission" ADD CONSTRAINT "UserKycSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserKycDocument" ADD CONSTRAINT "UserKycDocument_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "UserKycSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPixKey" ADD CONSTRAINT "UserPixKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLedgerEntry" ADD CONSTRAINT "UserLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOtp" ADD CONSTRAINT "UserOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixKey" ADD CONSTRAINT "PixKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitRule" ADD CONSTRAINT "SplitRule_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSplit" ADD CONSTRAINT "ChargeSplit_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSplit" ADD CONSTRAINT "ChargeSplit_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutConfig" ADD CONSTRAINT "CheckoutConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredentials" ADD CONSTRAINT "ProviderCredentials_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInteraction" ADD CONSTRAINT "PaymentInteraction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInteraction" ADD CONSTRAINT "PaymentInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInteraction" ADD CONSTRAINT "PaymentInteraction_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInteraction" ADD CONSTRAINT "PaymentInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCheckout" ADD CONSTRAINT "ProductCheckout_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBump" ADD CONSTRAINT "OrderBump_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "ProductCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpsellOffer" ADD CONSTRAINT "UpsellOffer_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "ProductCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliation" ADD CONSTRAINT "Affiliation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliation" ADD CONSTRAINT "Affiliation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoProducer" ADD CONSTRAINT "CoProducer_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoProducer" ADD CONSTRAINT "CoProducer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrice" ADD CONSTRAINT "CoursePrice_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPage" ADD CONSTRAINT "SalesPage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainConfig" ADD CONSTRAINT "DomainConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleTicket" ADD CONSTRAINT "RaffleTicket_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantProfile" ADD CONSTRAINT "MerchantProfile_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantDocument" ADD CONSTRAINT "MerchantDocument_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfeera_webhook_configs" ADD CONSTRAINT "transfeera_webhook_configs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
