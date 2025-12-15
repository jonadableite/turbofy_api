import { FeeCalculator, MerchantType } from "../FeeCalculator";

describe("FeeCalculator Service", () => {
    describe("calculateFee", () => {
        it("deve calcular taxa de 3.5% para merchant PRODUCER", () => {
            const fee = FeeCalculator.calculateFee({
                amountCents: 10000, // R$ 100.00
                merchantType: MerchantType.PRODUCER,
            });

            expect(fee).toBe(350); // R$ 3.50 (3.5%)
        });

        it("deve calcular taxa base de 1% para merchant RIFEIRO", () => {
            const fee = FeeCalculator.calculateFee({
                amountCents: 10000, // R$ 100.00
                merchantType: MerchantType.RIFEIRO,
            });

            expect(fee).toBe(100); // R$ 1.00
        });

        it("deve usar taxa customizada se fornecida", () => {
            const fee = FeeCalculator.calculateFee({
                amountCents: 10000,
                merchantType: MerchantType.PRODUCER,
                customFeePercentage: 3.0,
            });

            expect(fee).toBe(300); // R$ 3.00 (3%)
        });

        it("deve considerar taxa fixa por split para RIFEIRO", () => {
            const fee = FeeCalculator.calculateFee({
                amountCents: 10000, // R$ 100.00
                merchantType: MerchantType.RIFEIRO,
                splitsCount: 4,
            });

            expect(fee).toBe(112); // 1% (100) + 4 * R$0,03 (12)
        });

        it("deve retornar 0 para amountCents = 0", () => {
            const fee = FeeCalculator.calculateFee({
                amountCents: 0,
                merchantType: MerchantType.RIFEIRO,
            });

            expect(fee).toBe(0);
        });

        it("deve lançar erro se amountCents for negativo", () => {
            expect(() => {
                FeeCalculator.calculateFee({
                    amountCents: -100,
                    merchantType: MerchantType.RIFEIRO,
                });
            }).toThrow("FeeCalculator: amountCents deve ser um inteiro >= 0");
        });

        it("deve lançar erro se amountCents não for inteiro", () => {
            expect(() => {
                FeeCalculator.calculateFee({
                    amountCents: 100.5,
                    merchantType: MerchantType.RIFEIRO,
                });
            }).toThrow("FeeCalculator: amountCents deve ser um inteiro >= 0");
        });

        it("deve lançar erro se feePercentage for negativo", () => {
            expect(() => {
                FeeCalculator.calculateFee({
                    amountCents: 10000,
                    merchantType: MerchantType.RIFEIRO,
                    customFeePercentage: -1,
                });
            }).toThrow("FeeCalculator: feePercentage deve estar entre 0 e 100");
        });

        it("deve lançar erro se feePercentage for > 100", () => {
            expect(() => {
                FeeCalculator.calculateFee({
                    amountCents: 10000,
                    merchantType: MerchantType.RIFEIRO,
                    customFeePercentage: 101,
                });
            }).toThrow("FeeCalculator: feePercentage deve estar entre 0 e 100");
        });
        it("deve lançar erro se splitsCount for negativo", () => {
            expect(() => {
                FeeCalculator.calculateFee({
                    amountCents: 10000,
                    merchantType: MerchantType.RIFEIRO,
                    splitsCount: -1,
                });
            }).toThrow("FeeCalculator: splitsCount deve ser um inteiro >= 0");
        });

        it("deve lançar erro se splitsCount não for inteiro", () => {
            expect(() => {
                FeeCalculator.calculateFee({
                    amountCents: 10000,
                    merchantType: MerchantType.RIFEIRO,
                    splitsCount: 1.5,
                });
            }).toThrow("FeeCalculator: splitsCount deve ser um inteiro >= 0");
        });
    });

    describe("calculateNetAmount", () => {
        it("deve calcular valor líquido para merchant PRODUCER", () => {
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: 10000,
                merchantType: MerchantType.PRODUCER,
            });

            expect(netAmount).toBe(9650); // R$ 100 - R$ 3.50 (3.5%) = R$ 96.50
        });

        it("deve calcular valor líquido para merchant RIFEIRO com splits", () => {
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: 10000,
                merchantType: MerchantType.RIFEIRO,
                splitsCount: 2,
            });

            expect(netAmount).toBe(9894); // 1% (100) + 2*R$0,03 (6) => taxa 106, líquido 9.894
        });

        it("deve usar taxa customizada para cálculo líquido", () => {
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: 10000,
                merchantType: MerchantType.PRODUCER,
                customFeePercentage: 1.0,
            });

            expect(netAmount).toBe(9900); // R$ 100 - R$ 1 (1%) = R$ 99
        });

        it("deve retornar 0 se amountCents = 0", () => {
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: 0,
                merchantType: MerchantType.RIFEIRO,
            });

            expect(netAmount).toBe(0);
        });
    });

    describe("getDefaultFeePercentage", () => {
        it("deve retornar 3.5 para PRODUCER", () => {
            const feePercentage = FeeCalculator.getDefaultFeePercentage(
                MerchantType.PRODUCER
            );

            expect(feePercentage).toBe(3.5);
        });

        it("deve retornar 1 para RIFEIRO", () => {
            const feePercentage = FeeCalculator.getDefaultFeePercentage(
                MerchantType.RIFEIRO
            );

            expect(feePercentage).toBe(1);
        });
    });

    describe("isValidFeePercentage", () => {
        it("deve retornar true para valores válidos", () => {
            expect(FeeCalculator.isValidFeePercentage(0)).toBe(true);
            expect(FeeCalculator.isValidFeePercentage(2.5)).toBe(true);
            expect(FeeCalculator.isValidFeePercentage(50)).toBe(true);
            expect(FeeCalculator.isValidFeePercentage(100)).toBe(true);
        });

        it("deve retornar false para valores inválidos", () => {
            expect(FeeCalculator.isValidFeePercentage(-1)).toBe(false);
            expect(FeeCalculator.isValidFeePercentage(101)).toBe(false);
            expect(FeeCalculator.isValidFeePercentage(NaN)).toBe(false);
            expect(FeeCalculator.isValidFeePercentage(Infinity)).toBe(false);
        });
    });

    describe("casos reais de uso", () => {
        it("RIFEIRO: venda de bilhete de R$ 10.00", () => {
            const ticketPriceCents = 1000;
            const fee = FeeCalculator.calculateFee({
                amountCents: ticketPriceCents,
                merchantType: MerchantType.RIFEIRO,
                splitsCount: 1,
            });
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: ticketPriceCents,
                merchantType: MerchantType.RIFEIRO,
                splitsCount: 1,
            });

            expect(fee).toBe(13); // 1% (10) + R$0,03
            expect(netAmount).toBe(987); // R$ 9.87
        });

        it("RIFEIRO: venda de 100 bilhetes de R$ 5.00", () => {
            const totalAmountCents = 50000; // 100 * R$ 5.00
            const fee = FeeCalculator.calculateFee({
                amountCents: totalAmountCents,
                merchantType: MerchantType.RIFEIRO,
                splitsCount: 10,
            });
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: totalAmountCents,
                merchantType: MerchantType.RIFEIRO,
                splitsCount: 10,
            });

            expect(fee).toBe(800); // 1% (500) + R$0,03*10 (300) = 800
            expect(netAmount).toBe(49200); // R$ 492,00
        });

        it("PRODUCER: venda de curso de R$ 197.00", () => {
            const coursePriceCents = 19700;
            const fee = FeeCalculator.calculateFee({
                amountCents: coursePriceCents,
                merchantType: MerchantType.PRODUCER,
            });
            const netAmount = FeeCalculator.calculateNetAmount({
                amountCents: coursePriceCents,
                merchantType: MerchantType.PRODUCER,
            });

            expect(fee).toBe(689); // R$ 6.89 (3.5%)
            expect(netAmount).toBe(19011); // R$ 190.11
        });
    });
});
