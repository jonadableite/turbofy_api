import axios from "axios"
import { TransfeeraWebhookService } from "../TransfeeraWebhookService"

jest.mock("axios")

describe("TransfeeraWebhookService", () => {
  const repo = {
    create: jest.fn(),
    findByMerchant: jest.fn(),
    findByWebhookId: jest.fn(),
    findByAccountId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getSignatureSecret: jest.fn(),
  }

  const client = {
    createTransfeeraWebhook: jest.fn(),
    updateTransfeeraWebhook: jest.fn(),
    deleteTransfeeraWebhook: jest.fn(),
  }

  const service = new TransfeeraWebhookService(
    repo as any,
    client as any,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should create webhook and persist configuration", async () => {
    client.createTransfeeraWebhook.mockResolvedValue({
      id: "wh_1",
      company_id: "acc_1",
      url: "https://hook.example.com",
      object_types: ["Payin"],
      signature_secret: "secret-123",
      schema_version: "v1",
    })

    repo.create.mockResolvedValue({
      id: "id-1",
      merchantId: "m1",
      webhookId: "wh_1",
      accountId: "acc_1",
      url: "https://hook.example.com",
      objectTypes: ["Payin"],
      schemaVersion: "v1",
      active: true,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    })

    const result = await service.createWebhook("m1", "https://hook.example.com", ["Payin"])

    expect(client.createTransfeeraWebhook).toHaveBeenCalledWith("https://hook.example.com", ["Payin"])
    expect(repo.create).toHaveBeenCalled()
    expect(result.webhookId).toBe("wh_1")
    expect(result.accountId).toBe("acc_1")
  })

  it("should list webhooks for merchant", async () => {
    repo.findByMerchant.mockResolvedValue([
      {
        id: "id-1",
        merchantId: "m1",
        webhookId: "wh_1",
        accountId: "acc_1",
        url: "https://hook.example.com",
        objectTypes: ["Payin"],
        schemaVersion: "v1",
        active: true,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      },
    ])

    const result = await service.listWebhooks("m1")
    expect(result).toHaveLength(1)
    expect(result[0].webhookId).toBe("wh_1")
  })

  it("should test webhook by sending signed payload", async () => {
    repo.findByWebhookId.mockResolvedValue({
      id: "id-1",
      merchantId: "m1",
      webhookId: "wh_1",
      accountId: "acc_1",
      url: "https://hook.example.com",
      objectTypes: ["Payin"],
      schemaVersion: "v1",
      active: true,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    })
    repo.getSignatureSecret.mockResolvedValue("secret-123")
    ;(axios.post as jest.Mock).mockResolvedValue({ status: 200, statusText: "OK" })

    const result = await service.testWebhook("m1", "wh_1")
    expect(result.success).toBe(true)
    expect(axios.post).toHaveBeenCalled()
  })
})

