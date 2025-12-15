import { PrismaClient } from "@prisma/client";
import { TransfeeraBankingAdapter } from "../TransfeeraBankingAdapter";
import { TransfeeraClient } from "../../payment/TransfeeraClient";

const prismaStub = {} as PrismaClient;

const buildAdapter = (status: string): TransfeeraBankingAdapter => {
  const clientStub = {
    getTransfer: async () =>
      Promise.resolve({
        id: "transfer-1",
        status,
        batch_id: "batch-1",
      }),
  } as unknown as TransfeeraClient;

  return new TransfeeraBankingAdapter(clientStub, prismaStub);
};

describe("TransfeeraBankingAdapter - status mapping", () => {
  it("maps FINALIZADO to COMPLETED", async () => {
    const adapter = buildAdapter("FINALIZADO");
    const result = await adapter.getSettlementStatus("transfer-1");
    expect(result.status).toBe("COMPLETED");
  });

  it("maps DEVOLVIDO to FAILED", async () => {
    const adapter = buildAdapter("DEVOLVIDO");
    const result = await adapter.getSettlementStatus("transfer-2");
    expect(result.status).toBe("FAILED");
  });

  it("maps CRIADA to PROCESSING", async () => {
    const adapter = buildAdapter("CRIADA");
    const result = await adapter.getSettlementStatus("transfer-3");
    expect(result.status).toBe("PROCESSING");
  });
});

