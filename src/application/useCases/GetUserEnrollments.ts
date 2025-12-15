import { EnrollmentRepository } from "../../ports/repositories/EnrollmentRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Enrollment } from "../../domain/entities/Enrollment";
import { Course } from "../../domain/entities/Course";

interface GetUserEnrollmentsInput {
  userId: string;
}

interface EnrollmentWithCourse {
  enrollment: Enrollment;
  course: Course;
}

interface GetUserEnrollmentsOutput {
  enrollments: EnrollmentWithCourse[];
}

export class GetUserEnrollments {
  constructor(
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly courseRepository: CourseRepository
  ) {}

  async execute(input: GetUserEnrollmentsInput): Promise<GetUserEnrollmentsOutput> {
    const enrollments = await this.enrollmentRepository.findByUserId(input.userId);

    // Enriquecer com dados do curso
    const enrollmentsWithCourses: EnrollmentWithCourse[] = [];

    for (const enrollment of enrollments) {
      const course = await this.courseRepository.findById(enrollment.courseId);
      if (course) {
        enrollmentsWithCourses.push({
          enrollment,
          course,
        });
      }
    }

    return { enrollments: enrollmentsWithCourses };
  }
}

