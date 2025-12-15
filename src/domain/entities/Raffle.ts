import { randomUUID } from "crypto";

export enum RaffleStatus {
    DRAFT = "DRAFT",
    ACTIVE = "ACTIVE",
    SOLD_OUT = "SOLD_OUT",
    DRAWN = "DRAWN",
    CANCELLED = "CANCELLED",
}

export interface RaffleProps {
    id?: string;
    merchantId: string;
    title: string;
    description?: string;
    prizeDescription: string;
    thumbnailUrl?: string;
    ticketPriceCents: number;
    totalTickets: number;
    soldTickets?: number;
    status?: RaffleStatus;
    drawDate?: Date;
    drawnAt?: Date;
    winnerTicketNumber?: number;
    winnerName?: string;
    winnerEmail?: string;
    winnerPhone?: string;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
}

export class Raffle {
    readonly id: string;
    readonly merchantId: string;
    readonly title: string;
    readonly description?: string;
    readonly prizeDescription: string;
    readonly thumbnailUrl?: string;
    readonly ticketPriceCents: number;
    readonly totalTickets: number;
    readonly soldTickets: number;
    readonly status: RaffleStatus;
    readonly drawDate?: Date;
    readonly drawnAt?: Date;
    readonly winnerTicketNumber?: number;
    readonly winnerName?: string;
    readonly winnerEmail?: string;
    readonly winnerPhone?: string;
    readonly metadata?: Record<string, unknown>;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    constructor(props: RaffleProps) {
        this.id = props.id || randomUUID();
        this.merchantId = props.merchantId;
        this.title = props.title;
        this.description = props.description;
        this.prizeDescription = props.prizeDescription;
        this.thumbnailUrl = props.thumbnailUrl;
        this.ticketPriceCents = props.ticketPriceCents;
        this.totalTickets = props.totalTickets;
        this.soldTickets = props.soldTickets || 0;
        this.status = props.status || RaffleStatus.DRAFT;
        this.drawDate = props.drawDate;
        this.drawnAt = props.drawnAt;
        this.winnerTicketNumber = props.winnerTicketNumber;
        this.winnerName = props.winnerName;
        this.winnerEmail = props.winnerEmail;
        this.winnerPhone = props.winnerPhone;
        this.metadata = props.metadata;
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();

        this.validate();
    }

    private validate(): void {
        if (!this.merchantId || this.merchantId.trim().length === 0) {
            throw new Error("Raffle.merchantId é obrigatório");
        }

        if (!this.title || this.title.trim().length === 0) {
            throw new Error("Raffle.title é obrigatório");
        }

        if (!this.prizeDescription || this.prizeDescription.trim().length === 0) {
            throw new Error("Raffle.prizeDescription é obrigatório");
        }

        if (!Number.isInteger(this.ticketPriceCents) || this.ticketPriceCents <= 0) {
            throw new Error(
                "Raffle.ticketPriceCents deve ser um inteiro positivo"
            );
        }

        if (!Number.isInteger(this.totalTickets) || this.totalTickets <= 0) {
            throw new Error("Raffle.totalTickets deve ser um inteiro positivo");
        }

        if (
            !Number.isInteger(this.soldTickets) ||
            this.soldTickets < 0 ||
            this.soldTickets > this.totalTickets
        ) {
            throw new Error(
                "Raffle.soldTickets deve ser >= 0 e <= totalTickets"
            );
        }
    }

    canPublish(): boolean {
        return (
            this.status === RaffleStatus.DRAFT &&
            !!this.title &&
            !!this.prizeDescription &&
            !!this.drawDate
        );
    }

    canDraw(): boolean {
        return (
            (this.status === RaffleStatus.ACTIVE ||
                this.status === RaffleStatus.SOLD_OUT) &&
            !this.drawnAt
        );
    }

    canCancel(): boolean {
        return (
            this.status === RaffleStatus.DRAFT ||
            this.status === RaffleStatus.ACTIVE
        );
    }

    isSoldOut(): boolean {
        return this.soldTickets >= this.totalTickets;
    }

    getProgressPercentage(): number {
        return Math.floor((this.soldTickets / this.totalTickets) * 100);
    }

    getTotalRevenueCents(): number {
        return this.soldTickets * this.ticketPriceCents;
    }
}
