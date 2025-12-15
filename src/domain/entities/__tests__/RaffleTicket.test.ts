import { RaffleTicket, TicketStatus } from "../RaffleTicket";

describe("RaffleTicket Entity", () => {
    describe("constructor", () => {
        it("deve criar um bilhete válido com valores mínimos", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João Silva",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
            });

            expect(ticket).toBeDefined();
            expect(ticket.id).toBeDefined();
            expect(ticket.raffleId).toBe("raffle-123");
            expect(ticket.ticketNumber).toBe(1);
            expect(ticket.buyerName).toBe("João Silva");
            expect(ticket.buyerEmail).toBe("joao@example.com");
            expect(ticket.chargeId).toBe("charge-123");
            expect(ticket.status).toBe(TicketStatus.RESERVED);
            expect(ticket.reservedAt).toBeInstanceOf(Date);
            expect(ticket.createdAt).toBeInstanceOf(Date);
            expect(ticket.updatedAt).toBeInstanceOf(Date);
        });

        it("deve criar um bilhete com todos os campos opcionais", () => {
            const paidAt = new Date();
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 42,
                buyerName: "Maria Santos",
                buyerEmail: "maria@example.com",
                buyerPhone: "+5511999999999",
                buyerDocument: "12345678900",
                chargeId: "charge-123",
                status: TicketStatus.PAID,
                paidAt,
                metadata: { referral: "facebook" },
            });

            expect(ticket.buyerPhone).toBe("+5511999999999");
            expect(ticket.buyerDocument).toBe("12345678900");
            expect(ticket.status).toBe(TicketStatus.PAID);
            expect(ticket.paidAt).toBe(paidAt);
            expect(ticket.metadata).toEqual({ referral: "facebook" });
        });

        it("deve lançar erro se raffleId estiver vazio", () => {
            expect(() => {
                new RaffleTicket({
                    raffleId: "",
                    ticketNumber: 1,
                    buyerName: "João",
                    buyerEmail: "joao@example.com",
                    chargeId: "charge-123",
                });
            }).toThrow("RaffleTicket.raffleId é obrigatório");
        });

        it("deve lançar erro se ticketNumber for <= 0", () => {
            expect(() => {
                new RaffleTicket({
                    raffleId: "raffle-123",
                    ticketNumber: 0,
                    buyerName: "João",
                    buyerEmail: "joao@example.com",
                    chargeId: "charge-123",
                });
            }).toThrow("RaffleTicket.ticketNumber deve ser um inteiro positivo");
        });

        it("deve lançar erro se buyerName estiver vazio", () => {
            expect(() => {
                new RaffleTicket({
                    raffleId: "raffle-123",
                    ticketNumber: 1,
                    buyerName: "",
                    buyerEmail: "joao@example.com",
                    chargeId: "charge-123",
                });
            }).toThrow("RaffleTicket.buyerName é obrigatório");
        });

        it("deve lançar erro se buyerEmail estiver vazio", () => {
            expect(() => {
                new RaffleTicket({
                    raffleId: "raffle-123",
                    ticketNumber: 1,
                    buyerName: "João",
                    buyerEmail: "",
                    chargeId: "charge-123",
                });
            }).toThrow("RaffleTicket.buyerEmail é obrigatório");
        });

        it("deve lançar erro se buyerEmail for inválido", () => {
            expect(() => {
                new RaffleTicket({
                    raffleId: "raffle-123",
                    ticketNumber: 1,
                    buyerName: "João",
                    buyerEmail: "email-invalido",
                    chargeId: "charge-123",
                });
            }).toThrow("RaffleTicket.buyerEmail deve ser um email válido");
        });

        it("deve lançar erro se chargeId estiver vazio", () => {
            expect(() => {
                new RaffleTicket({
                    raffleId: "raffle-123",
                    ticketNumber: 1,
                    buyerName: "João",
                    buyerEmail: "joao@example.com",
                    chargeId: "",
                });
            }).toThrow("RaffleTicket.chargeId é obrigatório");
        });
    });

    describe("isPaid", () => {
        it("deve retornar true se status for PAID e paidAt estiver definido", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.PAID,
                paidAt: new Date(),
            });

            expect(ticket.isPaid()).toBe(true);
        });

        it("deve retornar false se status for RESERVED", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.RESERVED,
            });

            expect(ticket.isPaid()).toBe(false);
        });
    });

    describe("isCancelled", () => {
        it("deve retornar true se status for CANCELLED e cancelledAt estiver definido", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.CANCELLED,
                cancelledAt: new Date(),
            });

            expect(ticket.isCancelled()).toBe(true);
        });

        it("deve retornar false se status não for CANCELLED", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.RESERVED,
            });

            expect(ticket.isCancelled()).toBe(false);
        });
    });

    describe("isReserved", () => {
        it("deve retornar true se status for RESERVED", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.RESERVED,
            });

            expect(ticket.isReserved()).toBe(true);
        });

        it("deve retornar false se status for PAID", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.PAID,
                paidAt: new Date(),
            });

            expect(ticket.isReserved()).toBe(false);
        });
    });

    describe("canBeCancelled", () => {
        it("deve retornar true se status for RESERVED", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.RESERVED,
            });

            expect(ticket.canBeCancelled()).toBe(true);
        });

        it("deve retornar true se status for PAID", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.PAID,
                paidAt: new Date(),
            });

            expect(ticket.canBeCancelled()).toBe(true);
        });

        it("deve retornar false se status for CANCELLED", () => {
            const ticket = new RaffleTicket({
                raffleId: "raffle-123",
                ticketNumber: 1,
                buyerName: "João",
                buyerEmail: "joao@example.com",
                chargeId: "charge-123",
                status: TicketStatus.CANCELLED,
                cancelledAt: new Date(),
            });

            expect(ticket.canBeCancelled()).toBe(false);
        });
    });
});
