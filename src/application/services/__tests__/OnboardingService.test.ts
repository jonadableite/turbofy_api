import 'dotenv/config';
import { OnboardingService } from '../OnboardingService';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// Log DB URL for debugging (masked)
const dbUrl = process.env.DATABASE_URL;
console.log(
  'Test DB URL:',
  dbUrl ? dbUrl.replace(/:[^:@]*@/, ':****@') : 'UNDEFINED'
);

// Create fresh Prisma Client for tests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
});

describe.skip('OnboardingService (Integration)', () => {
  jest.setTimeout(60000); // 1 minute timeout
  const service = new OnboardingService();
  let merchantId: string;

  beforeAll(async () => {
    console.log('Connecting to DB...');
    await prisma.$connect();
    console.log('Connected.');
  });

  afterAll(async () => {
    console.log('Disconnecting...');
    await prisma.$disconnect();
    console.log('Disconnected.');
  });

  beforeEach(async () => {
    console.log('Cleaning DB...');
    // Clean up dependencies first
    await prisma.merchantDocument.deleteMany();
    await prisma.merchantProfile.deleteMany();
    // Delete other dependencies to avoid FK violations
    await prisma.charge.deleteMany();
    await prisma.paymentInteraction.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.pixKey.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.course.deleteMany();
    await prisma.raffle.deleteMany();
    await prisma.user.updateMany({ data: { merchantId: null } }); // Detach users

    await prisma.merchant.deleteMany();
    console.log('DB Cleaned.');

    merchantId = randomUUID();
    await prisma.merchant.create({
      data: {
        id: merchantId,
        name: 'Test Merchant',
        email: `test-${randomUUID()}@example.com`,
        document: `DOC-${randomUUID()}`,
      },
    });
    console.log('Test merchant created.');
  });

  it('throws when required documents are missing', async () => {
    // Setup profile
    await prisma.merchantProfile.create({
      data: {
        id: randomUUID(),
        merchantId,
        document: '12345678900',
        zipCode: '01001000',
        onboardingStep: 2,
        approvalStatus: 'PENDING',
      },
    });

    // Setup only one document
    await prisma.merchantDocument.create({
      data: {
        id: randomUUID(),
        merchantId,
        type: 'RG_FRONT',
        url: 'http://example.com/front.jpg',
        status: 'PENDING',
      },
    });

    await expect(
      service.completeOnboarding(merchantId)
    ).rejects.toThrow('Missing selfie document');
  });

  it('marks onboarding as pending approval when validations pass', async () => {
    // Setup profile
    await prisma.merchantProfile.create({
      data: {
        id: randomUUID(),
        merchantId,
        document: '12345678900',
        zipCode: '01001000',
        onboardingStep: 3,
        approvalStatus: 'PENDING',
      },
    });

    // Setup all required documents
    await prisma.merchantDocument.createMany({
      data: [
        {
          id: randomUUID(),
          merchantId,
          type: 'RG_FRONT',
          url: 'http://example.com/front.jpg',
          status: 'PENDING',
        },
        {
          id: randomUUID(),
          merchantId,
          type: 'RG_BACK',
          url: 'http://example.com/back.jpg',
          status: 'PENDING',
        },
        {
          id: randomUUID(),
          merchantId,
          type: 'SELFIE',
          url: 'http://example.com/selfie.jpg',
          status: 'PENDING',
        },
      ],
    });

    const result = await service.completeOnboarding(merchantId);

    expect(result.approvalStatus).toBe('PENDING_APPROVAL');

    // Verify DB updates
    const updatedProfile = await prisma.merchantProfile.findUnique({
      where: { merchantId },
    });
    expect(updatedProfile?.onboardingStep).toBe(4);
    expect(updatedProfile?.approvalStatus).toBe('PENDING_APPROVAL');

    const documents = await prisma.merchantDocument.findMany({
      where: { merchantId },
    });
    documents.forEach((doc) => {
      expect(doc.status).toBe('UNDER_REVIEW');
    });
  });

  it('returns missing document types via getStatus', async () => {
    // Setup profile
    await prisma.merchantProfile.create({
      data: {
        id: randomUUID(),
        merchantId,
        onboardingStep: 1,
        approvalStatus: 'PENDING',
      },
    });

    // Setup only one document
    await prisma.merchantDocument.create({
      data: {
        id: randomUUID(),
        merchantId,
        type: 'RG_FRONT',
        url: 'http://example.com/front.jpg',
        status: 'PENDING',
      },
    });

    const status = await service.getStatus(merchantId);

    // Missing SELFIE and BACK (since we have FRONT, but logic checks for PAIR)
    // Logic: hasFrontBackPair = has FRONT && has BACK
    // If missing pair, it adds both FRONT and BACK to missing list?
    // Let's check implementation:
    // if (!summary.hasFrontBackPair) missing.push("DOCUMENT_FRONT", "DOCUMENT_BACK");
    // So yes.

    expect(status.missingDocuments).toContain('SELFIE');
    expect(status.missingDocuments).toContain('DOCUMENT_FRONT');
    expect(status.missingDocuments).toContain('DOCUMENT_BACK');
    expect(status.step).toBe(1);
    expect(status.isComplete).toBe(false);
    expect(status.progress?.percent).toBeDefined();
    expect(status.progress?.stages).toHaveLength(5); // 4 base + 1 goLive
  });
});
