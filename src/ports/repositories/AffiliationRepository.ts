import { Affiliation, AffiliationStatus } from "../../domain/entities/Affiliation";

export interface AffiliationFilters {
  courseId?: string;
  userId?: string;
  status?: AffiliationStatus;
}

export interface AffiliationRepository {
  create(affiliation: Affiliation): Promise<Affiliation>;
  update(affiliation: Affiliation): Promise<Affiliation>;
  findById(id: string): Promise<Affiliation | null>;
  findByUserAndCourse(userId: string, courseId: string): Promise<Affiliation | null>;
  findByReferralCode(code: string): Promise<Affiliation | null>;
  list(filters: AffiliationFilters): Promise<Affiliation[]>;
}


