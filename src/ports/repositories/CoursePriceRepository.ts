export enum PriceType {
  ONE_TIME = "ONE_TIME",
  SUBSCRIPTION = "SUBSCRIPTION",
}

export interface CoursePriceRecord {
  id: string;
  courseId: string;
  type: PriceType;
  amountCents: number;
  currency: string;
  recurrenceInterval?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CoursePriceRepository {
  findById(id: string): Promise<CoursePriceRecord | null>;
  findByCourseId(courseId: string): Promise<CoursePriceRecord[]>;
  findActiveByCourseId(courseId: string): Promise<CoursePriceRecord | null>;
  create(data: {
    courseId: string;
    type: PriceType;
    amountCents: number;
    currency: string;
    recurrenceInterval?: string;
    active: boolean;
  }): Promise<CoursePriceRecord>;
  update(id: string, data: {
    type?: PriceType;
    amountCents?: number;
    currency?: string;
    recurrenceInterval?: string;
    active?: boolean;
  }): Promise<CoursePriceRecord>;
}

