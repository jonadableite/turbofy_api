import { LessonRepository } from '../../../ports/repositories/LessonRepository';
import {
  Lesson,
  VideoProvider,
  DownloadableFile,
} from '../../../domain/entities/Lesson';
import { prisma } from '../prismaClient';
import { VideoProvider as PrismaVideoProvider } from '@prisma/client';

export class PrismaLessonRepository implements LessonRepository {
  async findById(id: string): Promise<Lesson | null> {
    const record = await prisma.lesson.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByModuleId(moduleId: string): Promise<Lesson[]> {
    const records = await prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { position: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findPublishedByModuleId(moduleId: string): Promise<Lesson[]> {
    const records = await prisma.lesson.findMany({
      where: {
        moduleId,
        isPublished: true,
      },
      orderBy: { position: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async create(lesson: Lesson): Promise<Lesson> {
    const record = await prisma.lesson.create({
      data: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        videoProvider: lesson.videoProvider
          ? this.toPrismaVideoProvider(lesson.videoProvider)
          : null,
        videoKey: lesson.videoKey ?? null,
        contentHtml: lesson.contentHtml ?? null,
        downloadableFiles: (lesson.downloadableFiles ?? null) as any,
        position: lesson.position,
        isPublished: lesson.isPublished,
      },
    });

    return this.toDomain(record);
  }

  async update(lesson: Lesson): Promise<Lesson> {
    const record = await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        title: lesson.title,
        videoProvider: lesson.videoProvider
          ? this.toPrismaVideoProvider(lesson.videoProvider)
          : null,
        videoKey: lesson.videoKey ?? null,
        contentHtml: lesson.contentHtml ?? null,
        downloadableFiles: (lesson.downloadableFiles ?? null) as any,
        position: lesson.position,
        isPublished: lesson.isPublished,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.lesson.delete({
      where: { id },
    });
  }

  private toDomain(record: {
    id: string;
    moduleId: string;
    title: string;
    videoProvider: PrismaVideoProvider | null;
    videoKey: string | null;
    contentHtml: string | null;
    downloadableFiles: unknown;
    position: number;
    isPublished: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Lesson {
    return new Lesson({
      id: record.id,
      moduleId: record.moduleId,
      title: record.title,
      videoProvider: record.videoProvider
        ? this.toDomainVideoProvider(record.videoProvider)
        : undefined,
      videoKey: record.videoKey ?? undefined,
      contentHtml: record.contentHtml ?? undefined,
      downloadableFiles: record.downloadableFiles
        ? (record.downloadableFiles as DownloadableFile[])
        : undefined,
      position: record.position,
      isPublished: record.isPublished,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private toPrismaVideoProvider(
    provider: VideoProvider
  ): PrismaVideoProvider {
    const map: Record<VideoProvider, PrismaVideoProvider> = {
      [VideoProvider.PANDA]: PrismaVideoProvider.PANDA,
      [VideoProvider.BUNNY]: PrismaVideoProvider.BUNNY,
      [VideoProvider.VIMEO]: PrismaVideoProvider.VIMEO,
      [VideoProvider.YOUTUBE]: PrismaVideoProvider.YOUTUBE,
    };
    return map[provider];
  }

  private toDomainVideoProvider(
    provider: PrismaVideoProvider
  ): VideoProvider {
    const map: Record<PrismaVideoProvider, VideoProvider> = {
      [PrismaVideoProvider.PANDA]: VideoProvider.PANDA,
      [PrismaVideoProvider.BUNNY]: VideoProvider.BUNNY,
      [PrismaVideoProvider.VIMEO]: VideoProvider.VIMEO,
      [PrismaVideoProvider.YOUTUBE]: VideoProvider.YOUTUBE,
    };
    return map[provider];
  }
}
