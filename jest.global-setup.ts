import { execSync } from "child_process";

const ensureTestDatabase = (): void => {
  if (!process.env.DATABASE_URL) {
    // Usa SQLite local para testes se não houver DATABASE_URL definido
    process.env.DATABASE_URL = "file:./tmp/test.db";
  }

  if (!process.env.TRANSFEERA_WEBHOOK_SECRET) {
    process.env.TRANSFEERA_WEBHOOK_SECRET = "test-secret";
  }

  if (!process.env.RECAPTCHA_SECRET_KEY) {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
  }

  // NODE_ENV deve ser "test" durante o Jest
  process.env.NODE_ENV = "test";

  // Evita rodar o push múltiplas vezes
  if ((global as any).__PRISMA_PUSH_DONE__) {
    return;
  }

  try {
    execSync("pnpm prisma db push --accept-data-loss", {
      stdio: "inherit",
      env: {
        ...process.env,
      },
    });
    (global as any).__PRISMA_PUSH_DONE__ = true;
  } catch (error) {
    // Não lançar para não quebrar a suite inteira; os testes indicarão falha específica
    // eslint-disable-next-line no-console
    console.warn("⚠️  prisma db push falhou durante o setup de testes:", error);
  }
};

export default async function globalSetup(): Promise<void> {
  ensureTestDatabase();
}

