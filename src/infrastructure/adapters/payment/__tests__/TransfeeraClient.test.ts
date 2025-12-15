import axios from "axios";
import { TransfeeraClient } from "../TransfeeraClient";

jest.mock("axios");

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockDelete = jest.fn();
const mockPut = jest.fn();

const axiosCreateMock = {
  post: mockPost,
  get: mockGet,
  delete: mockDelete,
  put: mockPut,
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

describe("TransfeeraClient - new endpoints", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (axios.create as jest.Mock).mockReturnValue(axiosCreateMock);
  });

  it("creates Pix Automatic authorization", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "auth-1" } });
    const client = new TransfeeraClient();
    const result = await client.createPixAutomaticAuthorization({
      type: "authorization",
      frequency: "weekly",
      retry_policy: "not_allowed",
      start_date: "2025-12-05",
      payer: { name: "Payer", tax_id: "123", bank_ispb: "00000000", branch: "0001", account: "12345" },
      debtor: { name: "Debtor", tax_id: "456" },
    });
    expect(result.id).toBe("auth-1");
    expect(mockPost).toHaveBeenCalledWith("/pix/automatic/authorizations", expect.any(Object));
  });

  it("lists Pix Automatic payment intents with filters", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    const client = new TransfeeraClient();
    const list = await client.listPixAutomaticPaymentIntents({ authorization_id: "auth-1", page_cursor: "cur" });
    expect(list.items).toEqual([]);
    expect(mockGet).toHaveBeenCalledWith("/pix/automatic/payment_intents", {
      params: { authorization_id: "auth-1", page_cursor: "cur" },
    });
  });

  it("creates account", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "acc-1", customer_id: "cust-1", status: "pending" } });
    const client = new TransfeeraClient();
    const acc = await client.createAccount("cust-1");
    expect(acc.id).toBe("acc-1");
    expect(mockPost).toHaveBeenCalledWith("/accounts", { customer_id: "cust-1" });
  });

  it("lists infractions", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [{ id: "inf-1" }] } });
    const client = new TransfeeraClient();
    const res = await client.listMedInfractions({ transaction_id: "tx" });
    expect(res.items[0].id).toBe("inf-1");
    expect(mockGet).toHaveBeenCalledWith("/med/infractions", { params: { transaction_id: "tx" } });
  });

  it("creates Conta Certa webhook", async () => {
    // Primeiro create() para axiosInstance, segundo para contaCertaAxios
    (axios.create as jest.Mock).mockReturnValueOnce(axiosCreateMock).mockReturnValueOnce(axiosCreateMock);
    mockPost.mockResolvedValueOnce({ data: { id: "wh-1", url: "https://example.com" } });
    const client = new TransfeeraClient();
    const wh = await client.createContaCertaWebhook("https://example.com");
    expect(wh.id).toBe("wh-1");
    expect(mockPost).toHaveBeenCalledWith("/webhook", { url: "https://example.com" });
  });

  it("creates Transfeera webhook with object types", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "tw-1", signature_secret: "sec" } });
    const client = new TransfeeraClient();
    const wh = await client.createTransfeeraWebhook("https://cb.com", ["Transfer"]);
    expect(wh.id).toBe("tw-1");
    expect(mockPost).toHaveBeenCalledWith("/webhook", {
      url: "https://cb.com",
      object_types: ["Transfer"],
    });
  });

  it("lists Transfeera webhook events", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [], metadata: {} } });
    const client = new TransfeeraClient();
    const res = await client.listTransfeeraWebhookEvents({
      initialDate: "2025-01-01T00:00:00Z",
      endDate: "2025-01-02T00:00:00Z",
      page: "1",
      delivered: "true",
      objectType: "Transfer",
    });
    expect(res.data).toEqual([]);
    expect(mockGet).toHaveBeenCalledWith("/webhook/event", {
      params: {
        initialDate: "2025-01-01T00:00:00Z",
        endDate: "2025-01-02T00:00:00Z",
        page: "1",
        delivered: "true",
        objectType: "Transfer",
      },
    });
  });
});

