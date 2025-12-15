import { z } from "zod";
import { CourseStatus, AccessType } from "../../../domain/entities/Course";
import { VideoProvider } from "../../../domain/entities/Lesson";
import { PriceType } from "../../../ports/repositories/CoursePriceRepository";

// Course Schemas
export const CreateCourseRequestSchema = z.object({
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  title: z.string().min(1, "Title is required").max(255, "Title must be at most 255 characters"),
  description: z.string().max(5000, "Description must be at most 5000 characters").optional(),
  thumbnailUrl: z.string().url("thumbnailUrl must be a valid URL").optional(),
  accessType: z.nativeEnum(AccessType).optional(),
  certificateText: z.string().max(1000, "Certificate text must be at most 1000 characters").optional(),
});

export const UpdateCourseRequestSchema = z.object({
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  thumbnailUrl: z.string().url().optional(),
  accessType: z.nativeEnum(AccessType).optional(),
  certificateText: z.string().max(1000).optional(),
});

export const PublishCourseRequestSchema = z.object({
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
});

export const CourseResponseSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  status: z.nativeEnum(CourseStatus),
  accessType: z.nativeEnum(AccessType),
  certificateText: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CourseListResponseSchema = z.array(CourseResponseSchema);

// Module Schemas
export const CreateModuleRequestSchema = z.object({
  courseId: z.string().uuid("courseId must be a valid UUID"),
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  title: z.string().min(1, "Title is required").max(255, "Title must be at most 255 characters"),
});

export const ModuleResponseSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ModuleListResponseSchema = z.array(ModuleResponseSchema);

// Lesson Schemas
const DownloadableFileSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
});

export const CreateLessonRequestSchema = z.object({
  moduleId: z.string().uuid("moduleId must be a valid UUID"),
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  title: z.string().min(1, "Title is required").max(255, "Title must be at most 255 characters"),
  videoProvider: z.nativeEnum(VideoProvider).optional(),
  videoKey: z.string().optional(),
  contentHtml: z.string().optional(),
  downloadableFiles: z.array(DownloadableFileSchema).optional(),
});

export const UpdateLessonRequestSchema = z.object({
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  title: z.string().min(1).max(255).optional(),
  videoProvider: z.nativeEnum(VideoProvider).optional(),
  videoKey: z.string().optional(),
  contentHtml: z.string().optional(),
  downloadableFiles: z.array(DownloadableFileSchema).optional(),
  isPublished: z.boolean().optional(),
});

export const LessonResponseSchema = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  title: z.string(),
  videoProvider: z.nativeEnum(VideoProvider).nullable(),
  videoKey: z.string().nullable(),
  contentHtml: z.string().nullable(),
  downloadableFiles: z.array(DownloadableFileSchema).nullable(),
  position: z.number().int(),
  isPublished: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const LessonListResponseSchema = z.array(LessonResponseSchema);

// Price Schemas
export const UpsertCoursePriceRequestSchema = z.object({
  courseId: z.string().uuid("courseId must be a valid UUID"),
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  type: z.nativeEnum(PriceType),
  amountCents: z.number().int().positive("amountCents must be positive"),
  currency: z.string().default("BRL"),
  recurrenceInterval: z.string().optional(),
}).refine(
  (data) => {
    if (data.type === PriceType.SUBSCRIPTION) {
      return !!data.recurrenceInterval;
    }
    return true;
  },
  {
    message: "recurrenceInterval is required for subscription prices",
    path: ["recurrenceInterval"],
  }
);

export const CoursePriceResponseSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  type: z.nativeEnum(PriceType),
  amountCents: z.number().int(),
  currency: z.string(),
  recurrenceInterval: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Course with details (includes modules and lessons)
export const CourseDetailsResponseSchema = CourseResponseSchema.extend({
  modules: z.array(ModuleResponseSchema.extend({
    lessons: z.array(LessonResponseSchema),
  })),
  price: CoursePriceResponseSchema.nullable(),
});

