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
    const submission = await prisma.userKycSubmission.findUnique({
      where: { id: submissionId },
      include: { documents: true },
    });
    return submission ? mapSubmission(submission) : null;
  }

  async createSubmission(input: {
    userId: string;
    documents: UserKycDocumentRecord[];
  }): Promise<UserKycSubmissionRecord> {
    const created = await prisma.userKycSubmission.create({
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
    });

    return mapSubmission(created);
  }

  async findLatestByUserId(userId: string): Promise<UserKycSubmissionRecord | null> {
    const submission = await prisma.userKycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { documents: true },
    });
    return submission ? mapSubmission(submission) : null;
  }

  async updateStatus(input: {
    submissionId: string;
    status: string;
    rejectionReason?: string | null;
    reviewedByUserId?: string | null;
    reviewedAt?: Date;
  }): Promise<UserKycSubmissionRecord> {
    const updated = await prisma.userKycSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: input.status,
        rejectionReason: input.rejectionReason ?? null,
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewedAt: input.reviewedAt ?? new Date(),
      },
      include: { documents: true },
    });

    return mapSubmission(updated);
  }
}

