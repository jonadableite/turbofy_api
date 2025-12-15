import { randomUUID } from "crypto";

export enum TicketStatus {
    RESERVED = "RESERVED",
    PAID = "PAID",
    CANCELLED = "CANCELLED",
}

export interface RaffleTicketProps {
    id?: string;
    raffleId: string;
    ticketNumber: number;
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    buyerDocument?: string;
    chargeId: string;
    status?: TicketStatus;
    reservedAt?: Date;
    paidAt?: Date;
    cancelledAt?: Date;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
}

export class RaffleTicket {
    readonly id: string;
    readonly raffleId: string;
    readonly ticketNumber: number;
    readonly buyerName: string;
    readonly buyerEmail: string;
    readonly buyerPhone?: string;
    readonly buyerDocument?: string;
    readonly chargeId: string;
    readonly status: TicketStatus;
    readonly reservedAt: Date;
    readonly paidAt?: Date;
    readonly cancelledAt?: Date;
    readonly metadata?: Record<string, unknown>;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    constructor(props: RaffleTicketProps) {
        this.id = props.id || randomUUID();
        this.raffleId = props.raffleId;
        this.ticketNumber = props.ticketNumber;
        this.buyerName = props.buyerName;
        this.buyerEmail = props.buyerEmail;
        this.buyerPhone = props.buyerPhone;
        this.buyerDocument = props.buyerDocument;
        this.chargeId = props.chargeId;
        this.status = props.status || TicketStatus.RESERVED;
        this.reservedAt = props.reservedAt || new Date();
        this.paidAt = props.paidAt;
        this.cancelledAt = props.cancelledAt;
        this.metadata = props.metadata;
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();

        this.validate();
    }

    private validate(): void {
        if (!this.raffleId || this.raffleId.trim().length === 0) {
            throw new Error("RaffleTicket.raffleId é obrigatório");
        }

        if (!Number.isInteger(this.ticketNumber) || this.ticketNumber <= 0) {
            throw new Error(
                "RaffleTicket.ticketNumber deve ser um inteiro positivo"
            );
        }

        if (!this.buyerName || this.buyerName.trim().length === 0) {
            throw new Error("RaffleTicket.buyerName é obrigatório");
        }

        if (!this.buyerEmail || this.buyerEmail.trim().length === 0) {
            throw new Error("RaffleTicket.buyerEmail é obrigatório");
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(this.buyerEmail)) {
            throw new Error("RaffleTicket.buyerEmail deve ser um email válido");
        }

        if (!this.chargeId || this.chargeId.trim().length === 0) {
            throw new Error("RaffleTicket.chargeId é obrigatório");
        }
    }

    isPaid(): boolean {
        return this.status === TicketStatus.PAID && !!this.paidAt;
    }

    isCancelled(): boolean {
        return this.status === TicketStatus.CANCELLED && !!this.cancelledAt;
    }

    isReserved(): boolean {
        return this.status === TicketStatus.RESERVED;
    }

    canBeCancelled(): boolean {
        return this.status === TicketStatus.RESERVED || this.status === TicketStatus.PAID;
    }
}
