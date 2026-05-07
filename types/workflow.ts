export type CampaignWorkflowTemplate =
  | "outlet_registration"
  | "sales_activation"
  | "product_audit"
  | "existing_outlet_sales"
  | "full_trade_audit";

export type WorkflowActivityId =
  | "register_outlet"
  | "revisit_outlet"
  | "availability_survey"
  | "price_survey"
  | "product_survey"
  | "sell_to_outlet"
  | "photo_evidence"
  | "notes";

export type VisitOutcomeCode =
  | "products_sold"
  | "customer_refused"
  | "follow_up_needed"
  | "outlet_closed"
  | "not_interested";

export interface WorkflowActivityConfig {
  id: WorkflowActivityId;
  required?: boolean;
  settings?: Record<string, unknown>;
}

export interface CampaignWorkflowConfigV1 {
  workflowVersion: 1;
  template: CampaignWorkflowTemplate;
  activities: WorkflowActivityConfig[];
  validationRules: {
    requireGpsBeforeSubmit: boolean;
    requirePhotoEvidence: boolean;
    minimumPhotos: number;
    maximumPhotos: number;
  };
  agentCopy: {
    startVisitLabel: string;
    continueLabel: string;
    submitVisitLabel: string;
    outcomeQuestion: string;
    outcomes: Array<{ code: VisitOutcomeCode; label: string }>;
  };
}

export interface GuidedStep {
  id: string;
  title: string;
  activityId?: WorkflowActivityId;
}

export interface WorkflowSubmissionPayload {
  campaignId: string;
  selectedOutletRef: {
    mode: "existing" | "new";
    outletId?: string;
    outlet?: {
      name?: string;
      outletType?: string;
      contactPerson?: string;
      phone?: string;
      address?: string;
      state?: string;
      lga?: string;
    };
  };
  activityPayloads: Array<{
    activityId: WorkflowActivityId;
    payload: Record<string, unknown>;
  }>;
  outcome: {
    code: VisitOutcomeCode;
    label: string;
  };
  gps?: {
    latitude?: number;
    longitude?: number;
    locationAccuracy?: number;
  };
  photos?: Array<{ fileName?: string }>;
  clientSubmissionMeta?: Record<string, unknown>;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  deviceFingerprint?: string;
  syncStatus?: "pending" | "synced" | "failed";
}
