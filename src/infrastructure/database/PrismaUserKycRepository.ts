import { prisma } from "./prismaClient";
import {
  UserKycDocumentRecord,
  UserKycRepositoryPort,
  UserKycSubmissionRecord,
} from "../../ports/UserKycRepositoryPort";

const mapSubmission = (submission: any): UserKycSubmissionRecord => ({
  id: submission.id,
  userId: submission.userId,
  status: submission.status,
  rejectionReason: submission.rejectionReason,
  createdAt: submission.createdAt,
  reviewedAt: submission.reviewedAt,
  reviewedByUserId: submission.reviewedByUserId,
  documents: submission.documents?.map((doc: any) => ({
    type: doc.type,
    url: doc.url,
  })),
});

export class PrismaUserKycRepository implements UserKycRepositoryPort {
  async findById(submissionId: string): Promise<UserKycSubmissionRecord | null> {
    const prismaAny = prisma as any;
    const submission = await prismaAny.userKycSubmission.findUnique({
      where: { id: submissionId },
      include: { documents: true },
    } as any);
    return submission ? mapSubmission(submission) : null;
  }

  async createSubmission(input: {
    userId: string;
    documents: UserKycDocumentRecord[];
  }): Promise<UserKycSubmissionRecord> {
    const prismaAny = prisma as any;
    const created = await prismaAny.userKycSubmission.create({
      data: {
        userId: input.userId,
        status: "PENDING_REVIEW",
        documents: {
          create: input.documents.map((doc) => ({
            type: doc.type,
            url: doc.url,
          })),
        },
      },
      include: { documents: true },
    } as any);

    return mapSubmission(created);
  }

  async findLatestByUserId(userId: string): Promise<UserKycSubmissionRecord | null> {
    const prismaAny = prisma as any;
    const submission = await prismaAny.userKycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { documents: true },
    } as any);
    return submission ? mapSubmission(submission) : null;
  }

  async updateStatus(input: {
    submissionId: string;
    status: string;
    rejectionReason?: string | null;
    reviewedByUserId?: string | null;
    reviewedAt?: Date;
  }): Promise<UserKycSubmissionRecord> {
    const prismaAny = prisma as any;
    const updated = await prismaAny.userKycSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: input.status,
        rejectionReason: input.rejectionReason ?? null,
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewedAt: input.reviewedAt ?? new Date(),
      },
      include: { documents: true },
    } as any);

    return mapSubmission(updated);
  }
}

