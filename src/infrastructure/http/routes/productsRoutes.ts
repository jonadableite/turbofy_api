import { Router } from "express";
import { z } from "zod";
import { CreateCourse } from "../../../application/useCases/CreateCourse";
import { ListMarketplaceCourses } from "../../../application/useCases/marketplace/ListMarketplaceCourses";
import { RequestAffiliation } from "../../../application/useCases/affiliates/RequestAffiliation";
import { ApproveAffiliation } from "../../../application/useCases/affiliates/ApproveAffiliation";
import { PrismaCourseRepository } from "../../database/repositories/PrismaCourseRepository";
import { PrismaCoursePriceRepository } from "../../database/repositories/PrismaCoursePriceRepository";
import { PrismaAffiliationRepository } from "../../database/repositories/PrismaAffiliationRepository";
import { PriceType } from "../../../ports/repositories/CoursePriceRepository";
import { AffiliationStatus } from "../../../domain/entities/Affiliation";
import { AccessType } from "../../../domain/entities/Course";

export const productsRouter = Router();

const createProductSchema = z.object({
  merchantId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  accessType: z.enum(["LIFETIME", "SUBSCRIPTION"]).optional(),
  certificateText: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
  currency: z.string().optional().default("BRL"),
  affiliateProgramEnabled: z.boolean().optional().default(false),
  affiliateCommissionPercent: z.number().int().min(0).max(100).optional().default(0),
  marketplaceVisible: z.boolean().optional().default(false),
});

productsRouter.post("/create", async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const courseRepository = new PrismaCourseRepository();
  const coursePriceRepository = new PrismaCoursePriceRepository();
  const createCourse = new CreateCourse(courseRepository);

  const result = await createCourse.execute({
    merchantId: parsed.data.merchantId,
    title: parsed.data.title,
    description: parsed.data.description,
    thumbnailUrl: parsed.data.thumbnailUrl,
    accessType: parsed.data.accessType ? (parsed.data.accessType as AccessType) : undefined,
    certificateText: parsed.data.certificateText,
    marketplaceVisible: parsed.data.marketplaceVisible,
    affiliateProgramEnabled: parsed.data.affiliateProgramEnabled,
    affiliateCommissionPercent: parsed.data.affiliateCommissionPercent,
  });

  if (parsed.data.priceCents) {
    await coursePriceRepository.create({
      courseId: result.course.id,
      type: PriceType.ONE_TIME,
      amountCents: parsed.data.priceCents,
      currency: parsed.data.currency ?? "BRL",
      active: true,
    });
  }

  return res.status(201).json({
    id: result.course.id,
    inviteToken: result.course.affiliateInviteToken,
  });
});

const marketplaceQuerySchema = z.object({
  minCommissionPercent: z.coerce.number().min(0).max(100).optional(),
  minPriceCents: z.coerce.number().int().optional(),
  maxPriceCents: z.coerce.number().int().optional(),
  search: z.string().optional(),
});

productsRouter.get("/marketplace", async (req, res) => {
  const parsed = marketplaceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const courseRepository = new PrismaCourseRepository();
  const useCase = new ListMarketplaceCourses(courseRepository);
  const courses = await useCase.execute(parsed.data);

  return res.json(
    courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      thumbnailUrl: c.thumbnailUrl,
      commissionPercent: c.affiliateCommissionPercent,
      marketplaceVisible: c.marketplaceVisible,
    }))
  );
});

const requestAffiliationSchema = z.object({
  userId: z.string().uuid(),
  autoApprove: z.boolean().optional(),
});

productsRouter.post("/:id/affiliate-request", async (req, res) => {
  const parsed = requestAffiliationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const courseId = req.params.id;
  const courseRepository = new PrismaCourseRepository();
  const affiliationRepository = new PrismaAffiliationRepository();

  const useCase = new RequestAffiliation(courseRepository, affiliationRepository);
  const affiliation = await useCase.execute({
    courseId,
    userId: parsed.data.userId,
    autoApprove: parsed.data.autoApprove,
  });

  return res.status(201).json({
    id: affiliation.id,
    status: affiliation.status,
    referralCode: affiliation.referralCode,
    commissionPercent: affiliation.commissionPercent,
  });
});

const listRequestsQuery = z.object({
  courseId: z.string().uuid().optional(),
  status: z.nativeEnum(AffiliationStatus).optional(),
});

productsRouter.get("/affiliates/requests", async (req, res) => {
  const parsed = listRequestsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const affiliationRepository = new PrismaAffiliationRepository();
  const list = await affiliationRepository.list({
    courseId: parsed.data.courseId,
    status: parsed.data.status,
  });

  return res.json(
    list.map((a) => ({
      id: a.id,
      courseId: a.courseId,
      userId: a.userId,
      status: a.status,
      commissionPercent: a.commissionPercent,
      referralCode: a.referralCode,
      salesCount: a.salesCount,
    }))
  );
});

const approveBodySchema = z.object({
  commissionPercent: z.number().int().min(0).max(100).optional(),
});

productsRouter.post("/affiliates/requests/:id/approve", async (req, res) => {
  const parsed = approveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const affiliationRepository = new PrismaAffiliationRepository();
  const useCase = new ApproveAffiliation(affiliationRepository);
  const updated = await useCase.execute({
    affiliationId: req.params.id,
    commissionPercent: parsed.data.commissionPercent,
  });
  return res.json({
    id: updated.id,
    status: updated.status,
    commissionPercent: updated.commissionPercent,
  });
});

productsRouter.post("/affiliates/requests/:id/reject", async (req, res) => {
  const affiliationRepository = new PrismaAffiliationRepository();
  const affiliation = await affiliationRepository.findById(req.params.id);
  if (!affiliation) {
    return res.status(404).json({ error: "Solicitação não encontrada" });
  }
  affiliation.reject();
  const updated = await affiliationRepository.update(affiliation);
  return res.json({ id: updated.id, status: updated.status });
});


