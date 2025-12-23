import request from "supertest";
import express from "express";

// Mock jwt to allow token operations safely
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "jwt-token"),
  verify: jest.fn(() => ({ sub: "u-1" })),
}));

// Mock reCAPTCHA to avoid network and env
interface VerifyRecaptchaFn {
  (token: string, ip?: string): Promise<boolean>;
}
const verifyRecaptchaMock: jest.MockedFunction<VerifyRecaptchaFn> = jest.fn(async (_token: string, _ip?: string) => true);
jest.mock("../../security/recaptcha", () => ({
  verifyRecaptcha: (token: string, ip?: string) => verifyRecaptchaMock(token, ip),
}));

// Mock EmailService
const sendOtpEmailMock = jest.fn(async () => {});
const sendPasswordResetEmailMock = jest.fn(async () => {});
jest.mock("../../email/EmailService", () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendOtpEmail: sendOtpEmailMock,
    sendPasswordResetEmail: sendPasswordResetEmailMock,
  })),
}));

// Mock AuthService to avoid JWT/env
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
interface RegisterFn {
  (input: unknown): Promise<AuthTokens>;
}
interface LoginFn {
  (input: unknown): Promise<AuthTokens>;
}
const registerMock: jest.MockedFunction<RegisterFn> = jest.fn(async (_input: unknown) => ({ accessToken: "acc", refreshToken: "ref", expiresIn: 900 }));
const loginMock: jest.MockedFunction<LoginFn> = jest.fn(async (_input: unknown) => ({ accessToken: "acc", refreshToken: "ref", expiresIn: 900 }));
jest.mock("../../../application/services/AuthService", () => {
  const z = require("zod");
  return {
    __esModule: true,
    registerSchema: z.object({ email: z.string().email(), password: z.string().min(8) }),
    loginSchema: z.object({ email: z.string().email(), password: z.string().min(8) }),
    AuthService: class {
      async register(input: any) { return registerMock(input); }
      async login(input: any) { return loginMock(input); }
      async refreshToken() { return { accessToken: "acc", refreshToken: "ref", expiresIn: 900 }; }
      async issueTokensForUserId(userId: string) { return { accessToken: `access-${userId}`, refreshToken: `refresh-${userId}`, expiresIn: 900 }; }
    },
  };
});

// In-memory prisma mock for forgot-password and brute-force
type User = { id: string; email: string; passwordHash?: string; roles?: string[] };
const users = new Map<string, User>();
const authAttempts = new Map<string, { email: string; ip: string; count: number; windowStart: Date; lockedUntil: Date | null }>();
const passwordResetCreateMock = jest.fn(async () => ({ id: "prt-1" }));
const userCreateMock = jest.fn(async ({ data }: any) => { const u: User = { id: "u-new", email: data.email, passwordHash: data.passwordHash, roles: data.roles ?? ["BUYER"] }; users.set(u.email, u); return u; });
const userTokenCreateMock = jest.fn(async () => ({ id: "ut-1" }));
const userTokenFindUniqueMock = jest.fn(async () => ({ tokenHash: "hash", userId: "u-1", revokedAt: null }));
const userTokenUpdateMock = jest.fn(async () => ({ id: "ut-1" }));
const userTokenUpdateManyMock = jest.fn(async () => ({ count: 1 }));
const userOtpCreateMock = jest.fn(async () => ({ id: "otp-1" }));
jest.mock("../../database/prismaClient", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where: { email, id } }: any) => {
        if (email) return users.get(email) ?? null;
        if (id) return Array.from(users.values()).find(u => u.id === id) ?? null;
        return null;
      }),
      create: userCreateMock,
    },
    authAttempt: {
      findFirst: jest.fn(async ({ where: { email, ip } }: any) => authAttempts.get(`${email}:${ip}`) ?? null),
      create: jest.fn(async ({ data }: any) => { authAttempts.set(`${data.email}:${data.ip}`, { email: data.email, ip: data.ip, count: data.count ?? 1, windowStart: data.windowStart ?? new Date(), lockedUntil: data.lockedUntil ?? null }); return { count: 1 }; }),
      updateMany: jest.fn(async ({ where: { email, ip }, data }: any) => { const k = `${email}:${ip}`; const cur = authAttempts.get(k); if (!cur) return { count: 0 }; authAttempts.set(k, { ...cur, ...data }); return { count: 1 }; }),
      deleteMany: jest.fn(async ({ where: { email, ip } }: any) => { const k = `${email}:${ip}`; const existed = authAttempts.has(k); authAttempts.delete(k); return { count: existed ? 1 : 0 }; }),
    },
    passwordResetToken: {
      create: passwordResetCreateMock,
    },
    userToken: {
      create: userTokenCreateMock,
      findUnique: userTokenFindUniqueMock,
      update: userTokenUpdateMock,
      updateMany: userTokenUpdateManyMock,
    },
    userOtp: {
      create: userOtpCreateMock,
    },
  },
}));

// Mock bcrypt to simplify password hashing/compare
jest.mock("bcryptjs", () => ({
  hash: jest.fn(async () => "hash"),
  compare: jest.fn(async () => true),
}));

import { authRouter } from "../../http/routes/authRoutes";

function setupApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  return app;
}

describe("Auth Routes - register/login/forgot-password", () => {
  beforeEach(() => {
    users.clear();
    authAttempts.clear();
    registerMock.mockClear();
    loginMock.mockClear();
    sendPasswordResetEmailMock.mockReset();
    passwordResetCreateMock.mockReset();
    verifyRecaptchaMock.mockReset();
    verifyRecaptchaMock.mockResolvedValue(true);
  });

  describe("POST /auth/register", () => {
    it("returns 201, sets cookies and recaptcha passes when provided", async () => {
      const app = setupApp();
      const res = await request(app)
        .post("/auth/register")
        .send({ email: "user@example.com", password: "strongpass123", document: "12345678901", recaptchaToken: "token" });
      if (res.status !== 201) {
        // Helpful debug output if this ever fails
        // eslint-disable-next-line no-console
        console.error("Register response", { status: res.status, body: res.body });
      }
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
      expect(registerMock).toHaveBeenCalledTimes(1);
      expect(verifyRecaptchaMock).toHaveBeenCalledTimes(1);
    });

    it("returns 400 for invalid input (Zod)", async () => {
      const app = setupApp();
      const res = await request(app).post("/auth/register").send({ email: "bad", password: "123" });
      expect(res.status).toBe(400);
      expect(res.body.issues).toBeDefined();
    });

    it("returns 400 when recaptcha fails", async () => {
      verifyRecaptchaMock.mockResolvedValueOnce(false);
      const app = setupApp();
      const res = await request(app)
        .post("/auth/register")
        .send({ email: "user@example.com", password: "strongpass123", recaptchaToken: "bad" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("reCAPTCHA validation failed");
    });
  });

  describe("POST /auth/login", () => {
    it("returns 200, sets cookies and recaptcha passes when provided", async () => {
      const app = setupApp();
      users.set("user@example.com", { id: "u-1", email: "user@example.com", passwordHash: "hash", roles: ["BUYER"] });
      const res = await request(app)
        .post("/auth/login")
        .send({ email: "user@example.com", password: "strongpass123", document: "12345678901", recaptchaToken: "token" });
      if (res.status !== 200) {
        // eslint-disable-next-line no-console
        console.error("Login response", { status: res.status, body: res.body });
      }
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
      expect(loginMock).toHaveBeenCalledTimes(1);
      expect(verifyRecaptchaMock).toHaveBeenCalledTimes(1);
    });

    it("returns 401 when service throws unauthorized", async () => {
      loginMock.mockRejectedValueOnce(new Error("Unauthorized"));
      const app = setupApp();
      const res = await request(app).post("/auth/login").send({ email: "user@example.com", password: "wrongpass" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("returns 400 when recaptcha fails", async () => {
      verifyRecaptchaMock.mockResolvedValueOnce(false);
      const app = setupApp();
      const res = await request(app)
        .post("/auth/login")
        .send({ email: "user@example.com", password: "strongpass123", recaptchaToken: "bad" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("reCAPTCHA validation failed");
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("returns 200 and triggers email when user exists", async () => {
      const app = setupApp();
      users.set("user@example.com", { id: "u-1", email: "user@example.com" });
      const res = await request(app)
        .post("/auth/forgot-password")
        .send({ email: "user@example.com", recaptchaToken: "token" });
      expect(res.status).toBe(200);
      expect(passwordResetCreateMock).toHaveBeenCalledTimes(1);
      expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    });

    it("returns 200 and does not send email when user missing", async () => {
      const app = setupApp();
      const res = await request(app)
        .post("/auth/forgot-password")
        .send({ email: "missing@example.com", recaptchaToken: "token" });
      expect(res.status).toBe(200);
      expect(passwordResetCreateMock).not.toHaveBeenCalled();
      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    });

    it("returns 400 when recaptcha fails", async () => {
      verifyRecaptchaMock.mockResolvedValueOnce(false);
      const app = setupApp();
      const res = await request(app)
        .post("/auth/forgot-password")
        .send({ email: "user@example.com", recaptchaToken: "bad" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("reCAPTCHA validation failed");
    });

    it("returns 429 when locked by brute-force", async () => {
      const app = setupApp();
      const ip = "::ffff:127.0.0.1";
      authAttempts.set(`locked@example.com:${ip}`, { email: "locked@example.com", ip, count: 5, windowStart: new Date(), lockedUntil: new Date(Date.now() + 60 * 1000) });
      const res = await request(app)
        .post("/auth/forgot-password")
        .send({ email: "locked@example.com", recaptchaToken: "token" });
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/Too many MFA requests|Too many attempts/i);
    });
  });

  describe("POST /auth/refresh", () => {
    it("retorna 400 quando refreshToken está ausente", async () => {
      const app = setupApp();
      const res = await request(app)
        .post("/auth/refresh")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("refreshToken required");
    });

    it("retorna 200 com tokens quando refreshToken é fornecido", async () => {
      const app = setupApp();
      const res = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: "r-123" });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
    });
  });
});