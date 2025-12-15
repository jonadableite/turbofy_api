import { prisma } from "../../infrastructure/database/prismaClient";

const SELFIE_TYPE = "SELFIE";
const APPROVAL_STATUS = {
    pending: "PENDING",
    pendingApproval: "PENDING_APPROVAL",
    approved: "APPROVED",
    rejected: "REJECTED",
} as const;
const DOCUMENT_STATUS = {
    pendingReview: "PENDING_REVIEW",
    underReview: "UNDER_REVIEW",
} as const;

type MerchantPanelType = "PRODUCER" | "RIFEIRO";

interface ProgressStage {
    key: "personalData" | "address" | "documents" | "compliance" | "goLive" | "raffleSetup";
    label: string;
    required: boolean;
    complete: boolean;
}

export class OnboardingService {
    async getStatus(merchantId: string) {
        const [profile, merchant, documents] = await Promise.all([
            prisma.merchantProfile.findUnique({ where: { merchantId } }),
            prisma.merchant.findUnique({
                where: { id: merchantId },
                select: { type: true },
            }),
            prisma.merchantDocument.findMany({
                where: { merchantId },
                orderBy: { updatedAt: "desc" },
            }),
        ]);

        const merchantType: MerchantPanelType = (merchant?.type as MerchantPanelType) ?? "PRODUCER";
        const missingDocuments = this.getMissingDocumentTypes(documents);

        const personalDataComplete = Boolean(profile?.fullName && profile?.document && profile?.phone);
        const addressComplete = Boolean(
            profile?.zipCode &&
            profile?.street &&
            profile?.number &&
            profile?.city &&
            profile?.state
        );
        const documentsComplete = missingDocuments.length === 0;
        const complianceApproved = profile?.approvalStatus === APPROVAL_STATUS.approved;

        const [courseCount, raffleCount] = await Promise.all([
            prisma.course.count({ where: { merchantId } }),
            prisma.raffle.count({ where: { merchantId } }),
        ]);

        const goLiveRequirementComplete =
            merchantType === "RIFEIRO" ? raffleCount > 0 : courseCount > 0;

        const baseStages: ProgressStage[] = [
            {
                key: "personalData",
                label: "Informe seus dados pessoais",
                required: true,
                complete: personalDataComplete,
            },
            {
                key: "address",
                label: "Confirme endereço e informações fiscais",
                required: true,
                complete: addressComplete,
            },
            {
                key: "documents",
                label: "Envie e valide os documentos",
                required: true,
                complete: documentsComplete,
            },
            {
                key: "compliance",
                label: "Aguarde a validação da Turbofy",
                required: true,
                complete: complianceApproved,
            },
        ];

        const goLiveStage: ProgressStage =
            merchantType === "RIFEIRO"
                ? {
                      key: "raffleSetup",
                      label: "Configure a primeira rifa",
                      required: false,
                      complete: goLiveRequirementComplete,
                  }
                : {
                      key: "goLive",
                      label: "Crie um produto ou afilie-se a uma oferta",
                      required: true,
                      complete: goLiveRequirementComplete,
                  };

        const stages = [...baseStages, goLiveStage];
        const requiredStages = stages.filter((stage) => stage.required);
        const completedRequiredStages = requiredStages.filter((stage) => stage.complete).length;
        const progressPercent =
            requiredStages.length === 0
                ? 0
                : Math.round((completedRequiredStages / requiredStages.length) * 100);

        return {
            step: profile?.onboardingStep ?? 0,
            isComplete: requiredStages.every((stage) => stage.complete),
            approvalStatus: profile?.approvalStatus ?? APPROVAL_STATUS.pending,
            profile,
            missingDocuments,
            merchantType,
            progress: {
                percent: progressPercent,
                stages,
                offerRequirementComplete: goLiveRequirementComplete,
            },
            documents: documents.map((document) => ({
                id: document.id,
                type: document.type,
                status: document.status,
                url: document.url,
                mimeType: document.mimeType,
                fileSize: document.fileSize,
                updatedAt: document.updatedAt,
                rejectionReason: document.rejectionReason,
                verificationNotes: document.verificationNotes,
            })),
        };
    }

    async updatePersonalData(merchantId: string, data: any) {
        return prisma.merchantProfile.upsert({
            where: { merchantId },
            create: {
                merchantId,
                fullName: data.fullName,
                document: data.document,
                phone: data.phone,
                birthDate: data.birthDate ? new Date(data.birthDate) : null,
                revenueLast12Months: data.revenueLast12Months,
                projectedRevenue: data.projectedRevenue,
                onboardingStep: 1,
            },
            update: {
                fullName: data.fullName,
                document: data.document,
                phone: data.phone,
                birthDate: data.birthDate ? new Date(data.birthDate) : null,
                revenueLast12Months: data.revenueLast12Months,
                projectedRevenue: data.projectedRevenue,
                // onboardingStep not updated here to preserve progress if user goes back
            },
        }).then(async (profile) => {
            // If current step is < 1, update to 1
            if (profile.onboardingStep < 1) {
                return prisma.merchantProfile.update({
                    where: { merchantId },
                    data: { onboardingStep: 1 }
                });
            }
            return profile;
        });
    }

    async updateAddress(merchantId: string, data: any) {
        return prisma.merchantProfile.upsert({
            where: { merchantId },
            create: {
                merchantId,
                zipCode: data.zipCode,
                street: data.street,
                number: data.number,
                complement: data.complement,
                neighborhood: data.neighborhood,
                city: data.city,
                state: data.state,
                country: data.country,
                onboardingStep: 2,
            },
            update: {
                zipCode: data.zipCode,
                street: data.street,
                number: data.number,
                complement: data.complement,
                neighborhood: data.neighborhood,
                city: data.city,
                state: data.state,
                country: data.country,
            },
        }).then(async (profile) => {
            if (profile.onboardingStep < 2) {
                return prisma.merchantProfile.update({
                    where: { merchantId },
                    data: { onboardingStep: 2 }
                });
            }
            return profile;
        });
    }

    async completeOnboarding(merchantId: string) {
        // Check if all required data is present
        const profile = await prisma.merchantProfile.findUnique({
            where: { merchantId }
        });

        if (!profile) throw new Error("Profile not found");

        // Validate required fields (simplified)
        if (!profile.document || !profile.zipCode) {
            throw new Error("Campos obrigatórios não preenchidos. Por favor, complete os dados pessoais e endereço.");
        }

        // Validar documentos antes de enviar para análise
        await this.validateDocuments(merchantId);

        return prisma.merchantProfile.update({
            where: { merchantId },
            data: {
                onboardingStep: 4,
                approvalStatus: APPROVAL_STATUS.pendingApproval, // Send to compliance queue
            },
        });
    }

    private getMissingDocumentTypes(documents: Array<{ type: string }>): string[] {
        const summary = this.summarizeDocuments(documents);
        const missing: string[] = [];

        if (!summary.hasSelfie) {
            missing.push(SELFIE_TYPE);
        }

        if (!summary.hasFrontBackPair) {
            missing.push("DOCUMENT_FRONT", "DOCUMENT_BACK");
        }

        return missing;
    }

    private async validateDocuments(merchantId: string): Promise<void> {
        const documents = await prisma.merchantDocument.findMany({
            where: { merchantId },
        });

        // Verificar se os documentos têm URLs válidas (foram realmente enviados)
        const documentsWithValidUrl = documents.filter((doc) => doc.url && doc.url.trim().length > 0);
        
        if (documentsWithValidUrl.length === 0) {
            throw new Error("Você precisa enviar as fotos dos documentos antes de concluir o cadastro. Por favor, envie o documento (frente e verso) e a selfie.");
        }

        const summary = this.summarizeDocuments(documentsWithValidUrl);

        if (!summary.hasSelfie) {
            throw new Error("Falta enviar a selfie com documento. Por favor, envie uma foto segurando o documento ao lado do rosto.");
        }

        if (!summary.hasFrontBackPair) {
            throw new Error("Falta enviar as fotos do documento. Por favor, envie a frente e o verso do documento (RG, CNH ou RNE).");
        }

        const rejectedDocs = documents.filter((doc) => doc.status === "REJECTED");
        if (rejectedDocs.length > 0) {
            throw new Error("Existem documentos rejeitados que precisam ser substituídos antes de continuar. Por favor, envie novos documentos.");
        }

        await prisma.merchantDocument.updateMany({
            where: { 
                merchantId,
                id: { in: documentsWithValidUrl.map((d) => d.id) }
            },
            data: {
                status: DOCUMENT_STATUS.underReview,
            },
        });
    }

    private summarizeDocuments(documents: Array<{ type: string }>) {
        const normalized = documents.map((doc) => doc.type.toUpperCase());
        const hasSelfie = normalized.includes(SELFIE_TYPE);
        const baseMap = new Map<string, Set<string>>();

        normalized.forEach((type) => {
            const [base, side] = type.split("_");
            if (!side) return;
            if (!baseMap.has(base)) {
                baseMap.set(base, new Set());
            }
            baseMap.get(base)?.add(side);
        });

        const hasFrontBackPair = Array.from(baseMap.values()).some((sides) => sides.has("FRONT") && sides.has("BACK"));

        return { hasSelfie, hasFrontBackPair };
    }
}
