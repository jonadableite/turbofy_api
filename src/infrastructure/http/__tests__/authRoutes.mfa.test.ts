import request from "supertest";
import express from "express";
import bcrypt from "bcryptjs";

// In-memory stores (shared with AuthService mock)
type User = { id: string; email: string };
type UserOtp = { id: string; userId: string; codeHash: string; expiresAt: Date; consumedAt: Date | null; createdAt: Date };
type AuthAttempt = { email: string; ip: string; count: number; windowStart: Date; lockedUntil: Date | null };

const users = new Map<string, User>(); // key: email
const userOtps: UserOtp[] = [];
const authAttempts = new Map<string, AuthAttempt>(); // key: `${email}:${ip}`

const prismaMock = {
  user: {
    findUnique: jest.fn(async ({ where: { email } }: any) => users.get(email) || null),
  },
  userOtp: {
    findFirst: jest.fn(async ({ where: { userId, consumedAt, expiresAt }, orderBy }: any) => {
      const now = new Date();
      const filtered = userOtps.filter(
        (r) => r.userId === userId && r.consumedAt === consumedAt && r.expiresAt > (expiresAt?.gt ?? now)
      );
      const sorted = orderBy?.createdAt === "desc"
        ? filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        : filtered;
      return sorted[0] ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const rec: UserOtp = {
        id: `${userOtps.length + 1}`,
        userId: data.userId,
        codeHash: data.codeHash,
        expiresAt: data.expiresAt,
        consumedAt: null,
        createdAt: new Date(),
      };
      userOtps.push(rec);
      return rec;
    }),
    update: jest.fn(async ({ where: { id }, data }: any) => {
      const idx = userOtps.findIndex((r) => r.id === id);
      if (idx >= 0) {
        userOtps[idx] = { ...userOtps[idx], ...data };
        return userOtps[idx];
      }
      throw new Error("Record not found");
    }),
  },
  authAttempt: {
    findFirst: jest.fn(async ({ where: { email, ip } }: any) => authAttempts.get(`${email}:${ip}`) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const rec: AuthAttempt = {
        email: data.email,
        ip: data.ip,
        count: data.count ?? 1,
        windowStart: data.windowStart ?? new Date(),
        lockedUntil: data.lockedUntil ?? null,
      };
      authAttempts.set(`${rec.email}:${rec.ip}`, rec);
      return rec;
    }),
    updateMany: jest.fn(async ({ where: { email, ip }, data }: any) => {
      const k = `${email}:${ip}`;
      const cur = authAttempts.get(k);
      if (!cur) return { count: 0 };
      authAttempts.set(k, { ...cur, ...data });
      return { count: 1 };
    }),
    deleteMany: jest.fn(async ({ where: { email, ip } }: any) => {
      const k = `${email}:${ip}`;
      const existed = authAttempts.has(k);
      authAttempts.delete(k);
      return { count: existed ? 1 : 0 };
    }),
  },
  passwordResetToken: {
    create: jest.fn(async ({ data }: any) => ({ ...data, id: "prt-1" })),
  },
};

jest.mock("../../database/prismaClient", () => ({ prisma: prismaMock }));

// Mock reCAPTCHA to avoid env dependency and network calls
jest.mock("../../security/recaptcha", () => ({
  verifyRecaptcha: jest.fn(async () => true),
}));

// Mock EmailService to capture OTP/email sends without SMTP/env
interface SendOtpEmailFn {
  (email: string, otp: string): Promise<void>;
}
interface SendPasswordResetEmailFn {
  (email: string, token: string): Promise<void>;
}
const sendOtpEmailMock: jest.MockedFunction<SendOtpEmailFn> = jest.fn(async (_email: string, _otp: string) => {});
const sendPasswordResetEmailMock: jest.MockedFunction<SendPasswordResetEmailFn> = jest.fn(async (_email: string, _token: string) => {});
jest.mock("../../email/EmailService", () => {
  return {
    EmailService: jest.fn().mockImplementation(() => ({
      sendOtpEmail: sendOtpEmailMock,
      sendPasswordResetEmail: sendPasswordResetEmailMock,
    })),
  };
});

// Mock AuthService to avoid env/JWT/Prisma internals while keeping schemas available
jest.mock("../../../application/services/AuthService", () => {
  const z = require("zod");
  const bcryptjs = require("bcryptjs");

  return {
    registerSchema: z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
    loginSchema: z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
    AuthService: class {
      async issueTokensForUserId(userId: string) {
        return {
          accessToken: `access-${userId}`,
          refreshToken: `refresh-${userId}`,
          expiresIn: 15 * 60,
        };
      }

      async requestMfa(email: string): Promise<string | null> {
        // Checagem de bloqueio (qualquer IP para o email)
        const locked = Array.from(authAttempts.values()).find(
          (a) => a.email === email && a.lockedUntil && a.lockedUntil > new Date()
        );
        if (locked) {
          throw new Error("Too many attempts");
        }

        const user = users.get(email);
        if (!user) {
          return null;
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const codeHash = await bcryptjs.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await prismaMock.userOtp.create({ data: { userId: user.id, codeHash, expiresAt } });
        return otp;
      }

      async verifyMfa(email: string, otp: string) {
        const user = users.get(email);
        if (!user) {
          throw new Error("Invalid or expired code");
        }

        const record = userOtps
          .filter((r) => r.userId === user.id && !r.consumedAt && r.expiresAt > new Date())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        if (!record) {
          throw new Error("Invalid or expired code");
        }

        const ok = await bcryptjs.compare(otp, record.codeHash);
        if (!ok) {
          throw new Error("Invalid or expired code");
        }

        await prismaMock.userOtp.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
        return this.issueTokensForUserId(user.id);
      }

      // Unused methods in MFA tests can be no-ops
      async register() { return { accessToken: "a", refreshToken: "r", expiresIn: 900 }; }
      async login() { return { accessToken: "a", refreshToken: "r", expiresIn: 900 }; }
      async refreshToken() { return { accessToken: "a", refreshToken: "r", expiresIn: 900 }; }
    },
  };
});

import { authRouter } from "../../http/routes/authRoutes";

function resetState() {
  users.clear();
  userOtps.splice(0, userOtps.length);
  authAttempts.clear();
  sendOtpEmailMock.mockClear();
  sendPasswordResetEmailMock.mockClear();
  prismaMock.user.findUnique.mockClear();
  prismaMock.userOtp.findFirst.mockClear();
  prismaMock.userOtp.create.mockClear();
  prismaMock.userOtp.update.mockClear();
  prismaMock.authAttempt.findFirst.mockClear();
  prismaMock.authAttempt.create.mockClear();
  prismaMock.authAttempt.updateMany.mockClear();
  prismaMock.authAttempt.deleteMany.mockClear();
}

describe("Auth Routes - MFA", () => {
  let app: express.Express;

  beforeEach(() => {
    resetState();
    app = express();
    app.use(express.json());
    app.use("/auth", authRouter);
  });

  describe("POST /auth/mfa/request", () => {
    it("retorna 200 e envia OTP quando usuário existe", async () => {
      const email = "user@example.com";
      const userId = "u-1";
      users.set(email, { id: userId, email });

      const res = await request(app).post("/auth/mfa/request").send({ email });

      expect(res.status).toBe(200);
      expect(prismaMock.userOtp.create).toHaveBeenCalledTimes(1);
      expect(sendOtpEmailMock).toHaveBeenCalledTimes(1);
      const [calledEmail, calledOtp] = sendOtpEmailMock.mock.calls[0]!;
      expect(calledEmail).toBe(email);
      expect(typeof calledOtp).toBe("string");
      expect(calledOtp).toMatch(/^\d{6}$/);
    });

    it("retorna 200 e não envia OTP quando usuário não existe", async () => {
      const res = await request(app).post("/auth/mfa/request").send({ email: "missing@example.com" });

      expect(res.status).toBe(200);
      expect(prismaMock.userOtp.create).not.toHaveBeenCalled();
      expect(sendOtpEmailMock).not.toHaveBeenCalled();
    });

    it("retorna 400 para email inválido (Zod)", async () => {
      const res = await request(app).post("/auth/mfa/request").send({ email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(res.body.issues).toBeDefined();
    });

    it("retorna 429 quando bloqueado por brute-force (lockedUntil)", async () => {
      const email = "locked@example.com";
      const ip = "::ffff:127.0.0.1"; // supertest default
      authAttempts.set(`${email}:${ip}`, {
        email,
        ip,
        count: 5,
        windowStart: new Date(Date.now() - 1000),
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      const res = await request(app).post("/auth/mfa/request").send({ email });
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/Too many attempts/i);
    });
  });

  describe("POST /auth/mfa/verify", () => {
    it("retorna 200 e tokens quando OTP válido e não expirado", async () => {
      const email = "verify@example.com";
      const userId = "u-2";
      users.set(email, { id: userId, email });

      const otp = "123456";
      const codeHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      userOtps.push({ id: "otp-1", userId, codeHash, expiresAt, consumedAt: null, createdAt: new Date() });

      const res = await request(app).post("/auth/mfa/verify").send({ email, otp });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe(`access-${userId}`);
      expect(res.body.refreshToken).toBe(`refresh-${userId}`);

      // Registro deve ser marcado como consumido
      expect(prismaMock.userOtp.update).toHaveBeenCalledTimes(1);
    });

    it("retorna 401 quando usuário não existe", async () => {
      const res = await request(app).post("/auth/mfa/verify").send({ email: "missing@example.com", otp: "123456" });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired code/i);
    });

    it("retorna 401 quando não há OTP válido (expirado)", async () => {
      const email = "expired@example.com";
      const userId = "u-3";
      users.set(email, { id: userId, email });

      const otp = "654321";
      const codeHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() - 60 * 1000); // expirado
      userOtps.push({ id: "otp-exp", userId, codeHash, expiresAt, consumedAt: null, createdAt: new Date() });

      const res = await request(app).post("/auth/mfa/verify").send({ email, otp });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired code/i);
    });

    it("retorna 401 quando OTP é inválido", async () => {
      const email = "wrongotp@example.com";
      const userId = "u-4";
      users.set(email, { id: userId, email });

      const otpValid = "000111";
      const codeHash = await bcrypt.hash(otpValid, 10);
      const expiresAt = new Date(Date.now() + 60 * 1000);
      userOtps.push({ id: "otp-wrong", userId, codeHash, expiresAt, consumedAt: null, createdAt: new Date() });

      const res = await request(app).post("/auth/mfa/verify").send({ email, otp: "999999" });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired code/i);
    });

    it("retorna 429 quando bloqueado por brute-force (lockedUntil)", async () => {
      const email = "locked-verify@example.com";
      const ip = "::ffff:127.0.0.1";
      authAttempts.set(`${email}:${ip}`, {
        email,
        ip,
        count: 7,
        windowStart: new Date(Date.now() - 1000),
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      const res = await request(app).post("/auth/mfa/verify").send({ email, otp: "123456" });
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/Too many attempts/i);
    });
  });
});