import type {
  CampaignWorkflowConfigV1,
  CampaignWorkflowTemplate,
  GuidedStep,
  VisitOutcomeCode,
  WorkflowActivityId,
} from "@/types/workflow";

const DEFAULT_OUTCOMES: Array<{ code: VisitOutcomeCode; label: string }> = [
  { code: "products_sold", label: "Products sold" },
  { code: "customer_refused", label: "Customer refused to buy" },
  { code: "follow_up_needed", label: "Follow-up needed" },
  { code: "outlet_closed", label: "Outlet closed" },
  { code: "not_interested", label: "Not interested" },
];

function activitiesForTemplate(template: CampaignWorkflowTemplate): WorkflowActivityId[] {
  switch (template) {
    case "outlet_registration":
      return ["register_outlet", "photo_evidence", "notes"];
    case "sales_activation":
      return ["register_outlet", "sell_to_outlet", "photo_evidence", "notes"];
    case "product_audit":
      return ["availability_survey", "price_survey", "product_survey", "photo_evidence", "notes"];
    case "existing_outlet_sales":
      return ["revisit_outlet", "sell_to_outlet", "photo_evidence", "notes"];
    case "full_trade_audit":
      return ["register_outlet", "availability_survey", "price_survey", "product_survey", "sell_to_outlet", "photo_evidence", "notes"];
    default:
      return ["register_outlet", "sell_to_outlet", "photo_evidence", "notes"];
  }
}

export function buildWorkflowConfigFromTemplate(
  template: CampaignWorkflowTemplate,
  input?: Partial<CampaignWorkflowConfigV1>
): CampaignWorkflowConfigV1 {
  const activities = activitiesForTemplate(template).map((id) => ({ id, required: true }));
  return {
    workflowVersion: 1,
    template,
    activities,
    validationRules: {
      requireGpsBeforeSubmit: input?.validationRules?.requireGpsBeforeSubmit ?? true,
      requirePhotoEvidence: input?.validationRules?.requirePhotoEvidence ?? true,
      minimumPhotos: input?.validationRules?.minimumPhotos ?? 1,
      maximumPhotos: input?.validationRules?.maximumPhotos ?? 4,
    },
    agentCopy: {
      startVisitLabel: input?.agentCopy?.startVisitLabel ?? "Start Visit",
      continueLabel: input?.agentCopy?.continueLabel ?? "Continue",
      submitVisitLabel: input?.agentCopy?.submitVisitLabel ?? "Submit Visit",
      outcomeQuestion: input?.agentCopy?.outcomeQuestion ?? "What happened at this outlet?",
      outcomes: input?.agentCopy?.outcomes ?? DEFAULT_OUTCOMES,
    },
  };
}

export function deriveGuidedSteps(workflow: CampaignWorkflowConfigV1): GuidedStep[] {
  const activitySteps: GuidedStep[] = workflow.activities.map((activity) => ({
    id: `activity-${activity.id}`,
    title: toStepTitle(activity.id),
    activityId: activity.id,
  }));
  return [
    { id: "locate-outlet", title: "Locate Outlet" },
    ...activitySteps,
    { id: "review-submit", title: "Review & Submit" },
  ];
}

function toStepTitle(activityId: WorkflowActivityId): string {
  switch (activityId) {
    case "register_outlet":
      return "Outlet Information";
    case "revisit_outlet":
      return "Select Existing Outlet";
    case "availability_survey":
      return "Availability Check";
    case "price_survey":
      return "Price Check";
    case "product_survey":
      return "Product Audit";
    case "sell_to_outlet":
      return "Sales Capture";
    case "posm_deployment":
      return "POSM Deployment";
    case "free_sample_distribution":
      return "Free Sample";
    case "photo_evidence":
      return "Photo Evidence";
    case "notes":
      return "Notes";
    default:
      return "Visit Step";
  }
}

export function mapWorkflowOutcomeToVisitOutcome(code: VisitOutcomeCode): "converted" | "pending" | "revisit" | "no_sale" {
  if (code === "products_sold") return "converted";
  if (code === "follow_up_needed") return "no_sale";
  if (code === "outlet_closed") return "revisit";
  return "no_sale";
}
