import { CertificateRepository } from "../../../ports/repositories/CertificateRepository";
import { Certificate } from "../../../domain/entities/Certificate";
import { prisma } from "../prismaClient";

export class PrismaCertificateRepository implements CertificateRepository {
  async findById(id: string): Promise<Certificate | null> {
    const record = await prisma.certificate.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByEnrollmentId(enrollmentId: string): Promise<Certificate | null> {
    const record = await prisma.certificate.findFirst({
      where: { enrollmentId },
      orderBy: { issuedAt: "desc" },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByVerificationQr(qr: string): Promise<Certificate | null> {
    const record = await prisma.certificate.findFirst({
      where: { verificationQr: qr },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async create(certificate: Certificate): Promise<Certificate> {
    const record = await prisma.certificate.create({
      data: {
        id: certificate.id,
        enrollmentId: certificate.enrollmentId,
        verificationQr: certificate.verificationQr,
        pdfUrl: certificate.pdfUrl,
        issuedAt: certificate.issuedAt,
      },
    });

    return this.toDomain(record);
  }

  async update(certificate: Certificate): Promise<Certificate> {
    const record = await prisma.certificate.update({
      where: { id: certificate.id },
      data: {
        pdfUrl: certificate.pdfUrl,
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    enrollmentId: string;
    verificationQr: string | null;
    pdfUrl: string | null;
    issuedAt: Date;
    createdAt: Date;
  }): Certificate {
    return new Certificate({
      id: record.id,
      enrollmentId: record.enrollmentId,
      verificationQr: record.verificationQr ?? undefined,
      pdfUrl: record.pdfUrl ?? undefined,
      issuedAt: record.issuedAt,
      createdAt: record.createdAt,
    });
  }
}

