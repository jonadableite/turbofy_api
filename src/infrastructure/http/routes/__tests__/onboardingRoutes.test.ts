import request from 'supertest';
import express from 'express';
import { onboardingRouter } from '../onboardingRoutes';
import { prisma } from '../../../database/prismaClient';
import { randomUUID } from 'crypto';

// Mock auth middleware to allow injecting a specific user
const mockAuthMiddleware = jest.fn();
jest.mock('../../middlewares/authMiddleware', () => ({
  ensureAuthenticated: (req: any, res: any, next: any) =>
    mockAuthMiddleware(req, res, next),
}));

describe('Onboarding routes (Integration)', () => {
  const app = express();
  app.use(express.json());
  app.use('/onboarding', onboardingRouter);

  let merchantId: string;
  let userId: string;

  beforeAll(async () => {
    // Ensure connection
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up
    await prisma.merchantDocument.deleteMany();
    await prisma.merchantProfile.deleteMany();
    await prisma.merchant.deleteMany();

    // Create test merchant
    merchantId = randomUUID();
    userId = randomUUID();

    await prisma.merchant.create({
      data: {
        id: merchantId,
        name: 'Test Merchant',
        email: `test-${randomUUID()}@example.com`,
        document: `DOC-${randomUUID()}`,
      },
    });

    // Setup auth mock to return this merchant
    mockAuthMiddleware.mockImplementation(
      (req: any, _res: any, next: any) => {
        req.user = { id: userId, merchantId, roles: ['PRODUCER'] };
        next();
      }
    );
  });

  it('returns initial onboarding status', async () => {
    const response = await request(app).get('/onboarding/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        step: 0,
        isComplete: false,
        approvalStatus: 'PENDING',
      })
    );
  });

  it('updates personal data and advances step', async () => {
    const personalData = {
      fullName: 'John Doe',
      document: '12345678900',
      phone: '11999999999',
      birthDate: '1990-01-01',
      revenueLast12Months: '0-10k',
      projectedRevenue: '10k-50k',
    };

    const response = await request(app)
      .post('/onboarding/personal-data')
      .send(personalData);

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe(personalData.fullName);
    expect(response.body.onboardingStep).toBe(1);

    // Verify in DB
    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantId },
    });
    expect(profile).toBeDefined();
    expect(profile?.fullName).toBe(personalData.fullName);
    expect(profile?.onboardingStep).toBe(1);
  });

  it('updates address and advances step', async () => {
    // First set personal data to be at step 1
    await prisma.merchantProfile.create({
      data: {
        id: randomUUID(),
        merchantId,
        fullName: 'John Doe',
        onboardingStep: 1,
      },
    });

    const addressData = {
      zipCode: '12345-678',
      street: 'Test St',
      number: '123',
      neighborhood: 'Downtown',
      city: 'Test City',
      state: 'TS',
      country: 'Brasil',
    };

    const response = await request(app)
      .post('/onboarding/address')
      .send(addressData);

    expect(response.status).toBe(200);
    expect(response.body.zipCode).toBe(addressData.zipCode);
    expect(response.body.onboardingStep).toBe(2);

    // Verify in DB
    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantId },
    });
    expect(profile?.zipCode).toBe(addressData.zipCode);
    expect(profile?.onboardingStep).toBe(2);
  });
});
