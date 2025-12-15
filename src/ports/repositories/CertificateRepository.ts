import { Certificate } from "../../domain/entities/Certificate";

export interface CertificateRepository {
  findById(id: string): Promise<Certificate | null>;
  findByEnrollmentId(enrollmentId: string): Promise<Certificate | null>;
  findByVerificationQr(qr: string): Promise<Certificate | null>;
  create(certificate: Certificate): Promise<Certificate>;
  update(certificate: Certificate): Promise<Certificate>;
}

