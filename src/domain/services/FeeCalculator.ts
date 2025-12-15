export enum MerchantType {
    PRODUCER = "PRODUCER",
    RIFEIRO = "RIFEIRO",
}

export interface FeeCalculationParams {
    amountCents: number;
    merchantType: MerchantType;
    customFeePercentage?: number;
    splitsCount?: number;
}

const DEFAULT_FEE_PERCENTAGE_PRODUCER = 3.5; // 3.5% - MENOR DO MERCADO (vs 9.9% Hotmart)
const DEFAULT_FEE_PERCENTAGE_RIFEIRO = 1; // 1% - serviço Turbofy para rifeiros
const RIFEIRO_PER_SPLIT_FEE_CENTS = 3; // R$0,03 por split configurado

export class FeeCalculator {
    /**
     * Calcula a taxa (fee) baseada no tipo de merchant e valor da transação
     * @param params - Parâmetros para cálculo da taxa
     * @returns Valor da taxa em centavos
     */
    static calculateFee(params: FeeCalculationParams): number {
        const { amountCents, merchantType, customFeePercentage } = params;
        const splitsCount = params.splitsCount ?? 0;

        if (!Number.isInteger(amountCents) || amountCents < 0) {
            throw new Error(
                "FeeCalculator: amountCents deve ser um inteiro >= 0"
            );
        }

        if (!Number.isInteger(splitsCount) || splitsCount < 0) {
            throw new Error("FeeCalculator: splitsCount deve ser um inteiro >= 0");
        }

        if (merchantType === MerchantType.RIFEIRO) {
            const feePercentage = customFeePercentage ?? DEFAULT_FEE_PERCENTAGE_RIFEIRO;

            if (feePercentage < 0 || feePercentage > 100) {
                throw new Error(
                    "FeeCalculator: feePercentage deve estar entre 0 e 100"
                );
            }

            const percentageFeeCents = Math.floor(amountCents * (feePercentage / 100));
            const perSplitFeeCents = splitsCount * RIFEIRO_PER_SPLIT_FEE_CENTS;
            return percentageFeeCents + perSplitFeeCents;
        }

        const feePercentage = customFeePercentage ?? this.getDefaultFeePercentage(merchantType);

        if (feePercentage < 0 || feePercentage > 100) {
            throw new Error(
                "FeeCalculator: feePercentage deve estar entre 0 e 100"
            );
        }

        const feeAmountCents = Math.floor(amountCents * (feePercentage / 100));
        return feeAmountCents;
    }

    /**
     * Calcula o valor líquido após dedução da taxa
     * @param params - Parâmetros para cálculo
     * @returns Valor líquido em centavos
     */
    static calculateNetAmount(params: FeeCalculationParams): number {
        const feeAmountCents = this.calculateFee(params);
        return params.amountCents - feeAmountCents;
    }

    /**
     * Retorna a porcentagem de taxa padrão para o tipo de merchant
     * @param merchantType - Tipo de merchant
     * @returns Porcentagem de taxa
     */
    static getDefaultFeePercentage(merchantType: MerchantType): number {
        switch (merchantType) {
            case MerchantType.RIFEIRO:
                return DEFAULT_FEE_PERCENTAGE_RIFEIRO;
            case MerchantType.PRODUCER:
                return DEFAULT_FEE_PERCENTAGE_PRODUCER;
            default:
                return DEFAULT_FEE_PERCENTAGE_PRODUCER;
        }
    }

    /**
     * Valida se a taxa está dentro dos limites aceitáveis
     * @param feePercentage - Porcentagem a validar
     * @returns true se válido
     */
    static isValidFeePercentage(feePercentage: number): boolean {
        return (
            Number.isFinite(feePercentage) &&
            feePercentage >= 0 &&
            feePercentage <= 100
        );
    }
}
