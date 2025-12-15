
export interface MerchantProfileProps {
  id?: string;
  merchantId: string;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string | null;
  onboardingStep: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export class MerchantProfile {
  public readonly props: MerchantProfileProps;

  constructor(props: MerchantProfileProps) {
    this.props = {
      ...props,
      createdAt: props.createdAt || new Date(),
      updatedAt: props.updatedAt || new Date(),
    };
  }

  get id() { return this.props.id; }
  get merchantId() { return this.props.merchantId; }
  get approvalStatus() { return this.props.approvalStatus; }

  advanceStep(step: number) {
    if (step > this.props.onboardingStep) {
      this.props.onboardingStep = step;
      this.props.updatedAt = new Date();
    }
  }

  requestApproval() {
    // Can only request approval if documents are uploaded (handled by service/usecase)
    this.props.approvalStatus = 'PENDING';
    this.props.updatedAt = new Date();
  }

  approve() {
    this.props.approvalStatus = 'APPROVED';
    this.props.updatedAt = new Date();
  }

  reject(reason: string) {
    this.props.approvalStatus = 'REJECTED';
    this.props.approvalNotes = reason;
    this.props.updatedAt = new Date();
  }
  
  requestChanges(reason: string) {
    this.props.approvalStatus = 'CHANGES_REQUESTED';
    this.props.approvalNotes = reason;
    this.props.updatedAt = new Date();
  }
}

