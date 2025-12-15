import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware';
import { logger } from '../../logger';
import { prisma } from '../../database/prismaClient';
import {
  CreateCourseRequestSchema,
  UpdateCourseRequestSchema,
  PublishCourseRequestSchema,
  CourseResponseSchema,
  CourseListResponseSchema,
  CourseDetailsResponseSchema,
  CreateModuleRequestSchema,
  ModuleResponseSchema,
  ModuleListResponseSchema,
  CreateLessonRequestSchema,
  UpdateLessonRequestSchema,
  LessonResponseSchema,
  LessonListResponseSchema,
  UpsertCoursePriceRequestSchema,
  CoursePriceResponseSchema,
} from '../schemas/studio';
import { PrismaCourseRepository } from '../../database/repositories/PrismaCourseRepository';
import { PrismaModuleRepository } from '../../database/repositories/PrismaModuleRepository';
import { PrismaLessonRepository } from '../../database/repositories/PrismaLessonRepository';
import { PrismaCoursePriceRepository } from '../../database/repositories/PrismaCoursePriceRepository';
import { CreateCourse } from '../../../application/useCases/CreateCourse';
import { UpdateCourse } from '../../../application/useCases/UpdateCourse';
import { PublishCourse } from '../../../application/useCases/PublishCourse';
import { CreateModule } from '../../../application/useCases/CreateModule';
import { CreateLesson } from '../../../application/useCases/CreateLesson';
import { UpdateLesson } from '../../../application/useCases/UpdateLesson';
import { UpsertCoursePrice } from '../../../application/useCases/UpsertCoursePrice';
import { RecordLessonProgress } from '../../../application/useCases/RecordLessonProgress';
import { PrismaLessonProgressRepository } from '../../database/repositories/PrismaLessonProgressRepository';
import { PrismaEnrollmentRepository } from '../../database/repositories/PrismaEnrollmentRepository';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ensureMerchantId } from '../utils/ensureMerchantId';

export const studioRouter = Router();

// Rate limiter para endpoints do Studio
const isDevelopment = process.env.NODE_ENV === 'development';
const studioLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: isDevelopment ? 200 : 50,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (isDevelopment) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return (
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1'
      );
    }
    return false;
  },
});

// Helper para converter Course do domínio para resposta HTTP
function courseToResponse(course: any) {
  return {
    id: course.id,
    merchantId: course.merchantId,
    title: course.title,
    description: course.description ?? null,
    thumbnailUrl: course.thumbnailUrl ?? null,
    status: course.status,
    accessType: course.accessType,
    certificateText: course.certificateText ?? null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

// GET /studio/courses - Listar cursos do merchant
studioRouter.get(
  '/courses',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseRepository = new PrismaCourseRepository();
      const courses = await courseRepository.findByMerchantId(
        merchantId
      );

      const response = courses.map(courseToResponse);
      const validated = CourseListResponseSchema.parse(response);

      res.json(validated);
    } catch (err) {
      logger.error({ err }, 'Erro ao listar cursos');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// GET /studio/courses/:id - Detalhes do curso com módulos e aulas
studioRouter.get(
  '/courses/:id',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.id;

      const courseRepository = new PrismaCourseRepository();
      const course = await courseRepository.findById(courseId);

      if (!course) {
        return res
          .status(404)
          .json({
            error: {
              code: 'COURSE_NOT_FOUND',
              message: 'Curso não encontrado',
            },
          });
      }

      if (course.merchantId !== merchantId) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }

      // Buscar módulos e aulas
      const moduleRepository = new PrismaModuleRepository();
      const modules = await moduleRepository.findByCourseId(courseId);

      const lessonRepository = new PrismaLessonRepository();
      const modulesWithLessons = await Promise.all(
        modules.map(async (module) => {
          const lessons = await lessonRepository.findByModuleId(
            module.id
          );
          return {
            id: module.id,
            courseId: module.courseId,
            title: module.title,
            position: module.position,
            createdAt: module.createdAt.toISOString(),
            updatedAt: module.updatedAt.toISOString(),
            lessons: lessons.map((lesson) => ({
              id: lesson.id,
              moduleId: lesson.moduleId,
              title: lesson.title,
              videoProvider: lesson.videoProvider,
              videoKey: lesson.videoKey,
              contentHtml: lesson.contentHtml,
              downloadableFiles: lesson.downloadableFiles,
              position: lesson.position,
              isPublished: lesson.isPublished,
              createdAt: lesson.createdAt.toISOString(),
              updatedAt: lesson.updatedAt.toISOString(),
            })),
          };
        })
      );

      // Buscar preço ativo
      const priceRepository = new PrismaCoursePriceRepository();
      const price = await priceRepository.findActiveByCourseId(
        courseId
      );

      const response = {
        ...courseToResponse(course),
        modules: modulesWithLessons,
        price: price
          ? {
              id: price.id,
              courseId: price.courseId,
              type: price.type,
              amountCents: price.amountCents,
              currency: price.currency,
              recurrenceInterval: price.recurrenceInterval,
              active: price.active,
              createdAt: price.createdAt.toISOString(),
              updatedAt: price.updatedAt.toISOString(),
            }
          : null,
      };

      const validated = CourseDetailsResponseSchema.parse(response);
      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(500)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Erro de validação',
              details: err.issues,
            },
          });
      }
      logger.error({ err }, 'Erro ao buscar detalhes do curso');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// POST /studio/courses - Criar curso
studioRouter.post(
  '/courses',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const parsed = CreateCourseRequestSchema.parse(req.body);

      const courseRepository = new PrismaCourseRepository();
      const useCase = new CreateCourse(courseRepository);

      const { course } = await useCase.execute({
        merchantId,
        title: parsed.title,
        description: parsed.description,
        thumbnailUrl: parsed.thumbnailUrl,
        accessType: parsed.accessType,
        certificateText: parsed.certificateText,
      });

      const response = courseToResponse(course);
      const validated = CourseResponseSchema.parse(response);

      res.status(201).json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      logger.error({ err }, 'Erro ao criar curso');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// PUT /studio/courses/:id - Atualizar curso
studioRouter.put(
  '/courses/:id',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.id;
      const parsed = UpdateCourseRequestSchema.parse(req.body);

      const courseRepository = new PrismaCourseRepository();
      const useCase = new UpdateCourse(courseRepository);

      const { course } = await useCase.execute({
        courseId,
        merchantId,
        title: parsed.title,
        description: parsed.description,
        thumbnailUrl: parsed.thumbnailUrl,
        accessType: parsed.accessType,
        certificateText: parsed.certificateText,
      });

      const response = courseToResponse(course);
      const validated = CourseResponseSchema.parse(response);

      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'COURSE_NOT_FOUND',
              message: 'Curso não encontrado',
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      logger.error({ err }, 'Erro ao atualizar curso');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// POST /studio/courses/:id/publish - Publicar curso
studioRouter.post(
  '/courses/:id/publish',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.id;
      const parsed = PublishCourseRequestSchema.parse({ merchantId });

      const courseRepository = new PrismaCourseRepository();
      const moduleRepository = new PrismaModuleRepository();
      const lessonRepository = new PrismaLessonRepository();
      const useCase = new PublishCourse(
        courseRepository,
        moduleRepository,
        lessonRepository
      );

      const { course } = await useCase.execute({
        courseId,
        merchantId: parsed.merchantId,
      });

      const response = courseToResponse(course);
      const validated = CourseResponseSchema.parse(response);

      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'COURSE_NOT_FOUND',
              message: 'Curso não encontrado',
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      if ((err as Error).message.includes('cannot be published')) {
        return res
          .status(400)
          .json({
            error: {
              code: 'PUBLISH_ERROR',
              message: (err as Error).message,
            },
          });
      }
      logger.error({ err }, 'Erro ao publicar curso');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// POST /studio/courses/:courseId/modules - Criar módulo
studioRouter.post(
  '/courses/:courseId/modules',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.courseId;
      const parsed = CreateModuleRequestSchema.parse({
        ...req.body,
        courseId,
        merchantId,
      });

      const moduleRepository = new PrismaModuleRepository();
      const courseRepository = new PrismaCourseRepository();
      const useCase = new CreateModule(
        moduleRepository,
        courseRepository
      );

      const { module } = await useCase.execute(parsed);

      const response = {
        id: module.id,
        courseId: module.courseId,
        title: module.title,
        position: module.position,
        createdAt: module.createdAt.toISOString(),
        updatedAt: module.updatedAt.toISOString(),
      };

      const validated = ModuleResponseSchema.parse(response);
      res.status(201).json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'COURSE_NOT_FOUND',
              message: 'Curso não encontrado',
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      logger.error({ err }, 'Erro ao criar módulo');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// POST /studio/modules/:moduleId/lessons - Criar aula
studioRouter.post(
  '/modules/:moduleId/lessons',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const moduleId = req.params.moduleId;
      const parsed = CreateLessonRequestSchema.parse({
        ...req.body,
        moduleId,
        merchantId,
      });

      const lessonRepository = new PrismaLessonRepository();
      const moduleRepository = new PrismaModuleRepository();
      const courseRepository = new PrismaCourseRepository();
      const useCase = new CreateLesson(
        lessonRepository,
        moduleRepository,
        courseRepository
      );

      const { lesson } = await useCase.execute(parsed);

      const response = {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        videoProvider: lesson.videoProvider,
        videoKey: lesson.videoKey,
        contentHtml: lesson.contentHtml,
        downloadableFiles: lesson.downloadableFiles,
        position: lesson.position,
        isPublished: lesson.isPublished,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
      };

      const validated = LessonResponseSchema.parse(response);
      res.status(201).json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'MODULE_NOT_FOUND',
              message: 'Módulo não encontrado',
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      logger.error({ err }, 'Erro ao criar aula');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// PUT /studio/lessons/:id - Atualizar aula
studioRouter.put(
  '/lessons/:id',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const lessonId = req.params.id;
      const parsed = UpdateLessonRequestSchema.parse({
        ...req.body,
        merchantId,
      });

      const lessonRepository = new PrismaLessonRepository();
      const moduleRepository = new PrismaModuleRepository();
      const courseRepository = new PrismaCourseRepository();
      const useCase = new UpdateLesson(
        lessonRepository,
        moduleRepository,
        courseRepository
      );

      const { lesson } = await useCase.execute({
        lessonId,
        merchantId: parsed.merchantId,
        title: parsed.title,
        videoProvider: parsed.videoProvider,
        videoKey: parsed.videoKey,
        contentHtml: parsed.contentHtml,
        downloadableFiles: parsed.downloadableFiles,
        isPublished: parsed.isPublished,
      });

      const response = {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        videoProvider: lesson.videoProvider,
        videoKey: lesson.videoKey,
        contentHtml: lesson.contentHtml,
        downloadableFiles: lesson.downloadableFiles,
        position: lesson.position,
        isPublished: lesson.isPublished,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
      };

      const validated = LessonResponseSchema.parse(response);
      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'LESSON_NOT_FOUND',
              message: 'Aula não encontrada',
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      logger.error({ err }, 'Erro ao atualizar aula');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

// PUT /studio/courses/:courseId/price - Criar/atualizar preço do curso
studioRouter.put(
  '/courses/:courseId/price',
  studioLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.courseId;
      const parsed = UpsertCoursePriceRequestSchema.parse({
        ...req.body,
        courseId,
        merchantId,
      });

      const coursePriceRepository = new PrismaCoursePriceRepository();
      const courseRepository = new PrismaCourseRepository();
      const useCase = new UpsertCoursePrice(
        coursePriceRepository,
        courseRepository
      );

      const { price } = await useCase.execute(parsed);

      const response = {
        id: price.id,
        courseId: price.courseId,
        type: price.type,
        amountCents: price.amountCents,
        currency: price.currency,
        recurrenceInterval: price.recurrenceInterval,
        active: price.active,
        createdAt: price.createdAt.toISOString(),
        updatedAt: price.updatedAt.toISOString(),
      };

      const validated = CoursePriceResponseSchema.parse(response);
      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'COURSE_NOT_FOUND',
              message: 'Curso não encontrado',
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      if (
        (err as Error).message.includes(
          'must be greater than zero'
        ) ||
        (err as Error).message.includes('recurrenceInterval')
      ) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: (err as Error).message,
            },
          });
      }
      logger.error({ err }, 'Erro ao criar/atualizar preço');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);

/**
 * PUT /studio/lessons/:id/progress
 * Atualiza o progresso de uma aula
 */
studioRouter.put(
  '/lessons/:id/progress',
  authMiddleware,
  studioLimiter,
  async (req: Request, res: Response) => {
    try {
      const lessonId = req.params.id;
      const userId = req.user?.id;

      if (!userId) {
        return res
          .status(401)
          .json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Usuário não autenticado',
            },
          });
      }

      const bodySchema = z.object({
        progressPercent: z.number().min(0).max(100),
        enrollmentId: z.string().uuid(),
      });

      const parsed = bodySchema.parse(req.body);

      const lessonProgressRepository =
        new PrismaLessonProgressRepository();
      const enrollmentRepository = new PrismaEnrollmentRepository();
      const lessonRepository = new PrismaLessonRepository();

      const useCase = new RecordLessonProgress(
        lessonProgressRepository,
        enrollmentRepository,
        lessonRepository
      );

      const { progress } = await useCase.execute({
        userId,
        enrollmentId: parsed.enrollmentId,
        lessonId,
        progressPercent: parsed.progressPercent,
      });

      return res.status(200).json({
        id: progress.id,
        enrollmentId: progress.enrollmentId,
        lessonId: progress.lessonId,
        progressPercent: progress.progressPercent,
        completedAt: progress.completedAt?.toISOString(),
        createdAt: progress.createdAt.toISOString(),
        updatedAt: progress.updatedAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: err.issues,
            },
          });
      }
      if ((err as Error).message.includes('not found')) {
        return res
          .status(404)
          .json({
            error: {
              code: 'NOT_FOUND',
              message: (err as Error).message,
            },
          });
      }
      if ((err as Error).message.includes('Unauthorized')) {
        return res
          .status(403)
          .json({
            error: { code: 'FORBIDDEN', message: 'Acesso negado' },
          });
      }
      logger.error({ err }, 'Erro ao atualizar progresso da aula');
      res
        .status(500)
        .json({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno' },
        });
    }
  }
);
