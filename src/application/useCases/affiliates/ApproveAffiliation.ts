import { AffiliationStatus } from "../../../domain/entities/Affiliation";
import { AffiliationRepository } from "../../../ports/repositories/AffiliationRepository";

export interface ApproveAffiliationInput {
  affiliationId: string;
  commissionPercent?: number;
}

export class ApproveAffiliation {
  constructor(private readonly affiliationRepository: AffiliationRepository) {}

  async execute(input: ApproveAffiliationInput) {
    const affiliation = await this.affiliationRepository.findById(input.affiliationId);
    if (!affiliation) {
      throw new Error("Solicitação não encontrada");
    }
    if (input.commissionPercent !== undefined) {
      affiliation.setCommission(input.commissionPercent);
    }
    affiliation.approve();
    return this.affiliationRepository.update(affiliation);
  }
}


