import { CoProducer } from "../../domain/entities/CoProducer";

export interface CoProducerRepository {
  create(coProducer: CoProducer): Promise<CoProducer>;
  update(coProducer: CoProducer): Promise<CoProducer>;
  listByCourse(courseId: string): Promise<CoProducer[]>;
  findByCourseAndUser(courseId: string, userId: string): Promise<CoProducer | null>;
  deleteByCourseAndUser(courseId: string, userId: string): Promise<void>;
}


