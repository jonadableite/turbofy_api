import { CertificateRepository } from "../../ports/repositories/CertificateRepository";
import { EnrollmentRepository } from "../../ports/repositories/EnrollmentRepository";
import { LessonProgressRepository } from "../../ports/repositories/LessonProgressRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { ModuleRepository } from "../../ports/repositories/ModuleRepository";
import { LessonRepository } from "../../ports/repositories/LessonRepository";
import { Certificate } from "../../domain/entities/Certificate";
import { logger } from "../../infrastructure/logger";

interface IssueCertificateInput {
  userId: string;
  enrollmentId: string;
}

interface IssueCertificateOutput {
  certificate: Certificate;
}

export class IssueCertificate {
  constructor(
    private readonly certificateRepository: CertificateRepository,
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly lessonProgressRepository: LessonProgressRepository,
    private readonly courseRepository: CourseRepository,
    private readonly moduleRepository: ModuleRepository,
    private readonly lessonRepository: LessonRepository
  ) {}

  async execute(input: IssueCertificateInput): Promise<IssueCertificateOutput> {
    // Validar que a matrícula existe e pertence ao usuário
    const enrollment = await this.enrollmentRepository.findById(input.enrollmentId);

    if (!enrollment) {
      throw new Error(`Enrollment ${input.enrollmentId} not found`);
    }

    if (enrollment.userId !== input.userId) {
      throw new Error("Unauthorized: enrollment does not belong to this user");
    }

    if (!enrollment.isActive()) {
      throw new Error("Enrollment is not active");
    }

    // Verificar se já existe certificado
    const existingCertificate = await this.certificateRepository.findByEnrollmentId(input.enrollmentId);

    if (existingCertificate) {
      logger.info(
        {
          useCase: "IssueCertificate",
          entityId: existingCertificate.id,
          enrollmentId: input.enrollmentId,
        },
        "Certificate already exists (idempotent)"
      );
      return { certificate: existingCertificate };
    }

    // Verificar se o usuário completou o curso
    const course = await this.courseRepository.findById(enrollment.courseId);

    if (!course) {
      throw new Error(`Course ${enrollment.courseId} not found`);
    }

    // Calcular progresso total
    const modules = await this.moduleRepository.findByCourseId(course.id);
    let totalLessons = 0;
    let completedLessons = 0;

    for (const module of modules) {
      const lessons = await this.lessonRepository.findPublishedByModuleId(module.id);

      for (const lesson of lessons) {
        totalLessons++;
        const progress = await this.lessonProgressRepository.findByEnrollmentIdAndLessonId(
          enrollment.id,
          lesson.id
        );

        if (progress && progress.isCompleted()) {
          completedLessons++;
        }
      }
    }

    const completionPercent = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

    // Exigir 100% de conclusão
    if (completionPercent < 100) {
      throw new Error(
        `Cannot issue certificate: course completion is ${Math.round(completionPercent)}%, must be 100%`
      );
    }

    // Criar certificado
    const certificate = Certificate.create({
      enrollmentId: input.enrollmentId,
      // pdfUrl será gerado posteriormente (Fase 5)
    });

    const savedCertificate = await this.certificateRepository.create(certificate);

    logger.info(
      {
        useCase: "IssueCertificate",
        entityId: savedCertificate.id,
        enrollmentId: input.enrollmentId,
        userId: input.userId,
      },
      "Certificate issued"
    );

    return { certificate: savedCertificate };
  }
}

