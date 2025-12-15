import { Raffle, RaffleStatus } from "../Raffle";

describe("Raffle Entity", () => {
    describe("constructor", () => {
        it("deve criar uma rifa válida com valores mínimos", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa de Moto",
                prizeDescription: "Honda CG 160 Fan 2024",
                ticketPriceCents: 1000, // R$ 10.00
                totalTickets: 100,
            });

            expect(raffle).toBeDefined();
            expect(raffle.id).toBeDefined();
            expect(raffle.merchantId).toBe("merchant-123");
            expect(raffle.title).toBe("Rifa de Moto");
            expect(raffle.prizeDescription).toBe("Honda CG 160 Fan 2024");
            expect(raffle.ticketPriceCents).toBe(1000);
            expect(raffle.totalTickets).toBe(100);
            expect(raffle.soldTickets).toBe(0);
            expect(raffle.status).toBe(RaffleStatus.DRAFT);
            expect(raffle.createdAt).toBeInstanceOf(Date);
            expect(raffle.updatedAt).toBeInstanceOf(Date);
        });

        it("deve criar uma rifa com todos os campos opcionais", () => {
            const drawDate = new Date("2025-12-31");
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa Beneficente",
                description: "Rifa para ajudar instituição XYZ",
                prizeDescription: "Carro 0km",
                thumbnailUrl: "https://example.com/thumb.jpg",
                ticketPriceCents: 5000,
                totalTickets: 500,
                soldTickets: 50,
                status: RaffleStatus.ACTIVE,
                drawDate,
                metadata: { category: "beneficente" },
            });

            expect(raffle.description).toBe("Rifa para ajudar instituição XYZ");
            expect(raffle.thumbnailUrl).toBe("https://example.com/thumb.jpg");
            expect(raffle.soldTickets).toBe(50);
            expect(raffle.status).toBe(RaffleStatus.ACTIVE);
            expect(raffle.drawDate).toBe(drawDate);
            expect(raffle.metadata).toEqual({ category: "beneficente" });
        });

        it("deve lançar erro se merchantId estiver vazio", () => {
            expect(() => {
                new Raffle({
                    merchantId: "",
                    title: "Rifa",
                    prizeDescription: "Premio",
                    ticketPriceCents: 1000,
                    totalTickets: 100,
                });
            }).toThrow("Raffle.merchantId é obrigatório");
        });

        it("deve lançar erro se title estiver vazio", () => {
            expect(() => {
                new Raffle({
                    merchantId: "merchant-123",
                    title: "",
                    prizeDescription: "Premio",
                    ticketPriceCents: 1000,
                    totalTickets: 100,
                });
            }).toThrow("Raffle.title é obrigatório");
        });

        it("deve lançar erro se prizeDescription estiver vazio", () => {
            expect(() => {
                new Raffle({
                    merchantId: "merchant-123",
                    title: "Rifa",
                    prizeDescription: "",
                    ticketPriceCents: 1000,
                    totalTickets: 100,
                });
            }).toThrow("Raffle.prizeDescription é obrigatório");
        });

        it("deve lançar erro se ticketPriceCents for <= 0", () => {
            expect(() => {
                new Raffle({
                    merchantId: "merchant-123",
                    title: "Rifa",
                    prizeDescription: "Premio",
                    ticketPriceCents: 0,
                    totalTickets: 100,
                });
            }).toThrow("Raffle.ticketPriceCents deve ser um inteiro positivo");
        });

        it("deve lançar erro se totalTickets for <= 0", () => {
            expect(() => {
                new Raffle({
                    merchantId: "merchant-123",
                    title: "Rifa",
                    prizeDescription: "Premio",
                    ticketPriceCents: 1000,
                    totalTickets: 0,
                });
            }).toThrow("Raffle.totalTickets deve ser um inteiro positivo");
        });

        it("deve lançar erro se soldTickets for > totalTickets", () => {
            expect(() => {
                new Raffle({
                    merchantId: "merchant-123",
                    title: "Rifa",
                    prizeDescription: "Premio",
                    ticketPriceCents: 1000,
                    totalTickets: 100,
                    soldTickets: 150,
                });
            }).toThrow("Raffle.soldTickets deve ser >= 0 e <= totalTickets");
        });
    });

    describe("canPublish", () => {
        it("deve retornar true se rifa DRAFT com dados completos", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.DRAFT,
                drawDate: new Date("2025-12-31"),
            });

            expect(raffle.canPublish()).toBe(true);
        });

        it("deve retornar false se rifa não estiver DRAFT", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.ACTIVE,
                drawDate: new Date("2025-12-31"),
            });

            expect(raffle.canPublish()).toBe(false);
        });

        it("deve retornar false se drawDate não estiver definida", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.DRAFT,
            });

            expect(raffle.canPublish()).toBe(false);
        });
    });

    describe("canDraw", () => {
        it("deve retornar true se rifa ACTIVE e não sorteada", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.ACTIVE,
            });

            expect(raffle.canDraw()).toBe(true);
        });

        it("deve retornar true se rifa SOLD_OUT e não sorteada", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.SOLD_OUT,
            });

            expect(raffle.canDraw()).toBe(true);
        });

        it("deve retornar false se rifa já foi sorteada", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.ACTIVE,
                drawnAt: new Date(),
            });

            expect(raffle.canDraw()).toBe(false);
        });

        it("deve retornar false se rifa DRAFT", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                status: RaffleStatus.DRAFT,
            });

            expect(raffle.canDraw()).toBe(false);
        });
    });

    describe("isSoldOut", () => {
        it("deve retornar true se todos os bilhetes foram vendidos", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                soldTickets: 100,
            });

            expect(raffle.isSoldOut()).toBe(true);
        });

        it("deve retornar false se ainda restam bilhetes", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                soldTickets: 50,
            });

            expect(raffle.isSoldOut()).toBe(false);
        });
    });

    describe("getProgressPercentage", () => {
        it("deve calcular porcentagem de vendas corretamente", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                soldTickets: 50,
            });

            expect(raffle.getProgressPercentage()).toBe(50);
        });

        it("deve retornar 0% se nenhum bilhete foi vendido", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
            });

            expect(raffle.getProgressPercentage()).toBe(0);
        });

        it("deve retornar 100% se todos os bilhetes foram vendidos", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
                soldTickets: 100,
            });

            expect(raffle.getProgressPercentage()).toBe(100);
        });
    });

    describe("getTotalRevenueCents", () => {
        it("deve calcular receita total corretamente", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000, // R$ 10.00
                totalTickets: 100,
                soldTickets: 50,
            });

            expect(raffle.getTotalRevenueCents()).toBe(50000); // R$ 500.00
        });

        it("deve retornar 0 se nenhum bilhete foi vendido", () => {
            const raffle = new Raffle({
                merchantId: "merchant-123",
                title: "Rifa",
                prizeDescription: "Premio",
                ticketPriceCents: 1000,
                totalTickets: 100,
            });

            expect(raffle.getTotalRevenueCents()).toBe(0);
        });
    });
});
