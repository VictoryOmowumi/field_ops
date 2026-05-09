import { z } from "zod";

export const workflowTemplateSchema = z.enum([
  "outlet_registration",
  "sales_activation",
  "product_audit",
  "existing_outlet_sales",
  "full_trade_audit",
]);

export const workflowActivityIdSchema = z.enum([
  "register_outlet",
  "revisit_outlet",
  "availability_survey",
  "price_survey",
  "product_survey",
  "sell_to_outlet",
  "posm_deployment",
  "photo_evidence",
  "notes",
]);

export const visitOutcomeCodeSchema = z.enum([
  "products_sold",
  "customer_refused",
  "follow_up_needed",
  "outlet_closed",
  "not_interested",
]);

export const campaignWorkflowConfigV1Schema = z.object({
  workflowVersion: z.literal(1),
  template: workflowTemplateSchema,
  activities: z.array(z.object({
    id: workflowActivityIdSchema,
    required: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  validationRules: z.object({
    requireGpsBeforeSubmit: z.boolean(),
    requirePhotoEvidence: z.boolean(),
    minimumPhotos: z.number().int().nonnegative(),
    maximumPhotos: z.number().int().positive(),
  }),
  agentCopy: z.object({
    startVisitLabel: z.string().min(1),
    continueLabel: z.string().min(1),
    submitVisitLabel: z.string().min(1),
    outcomeQuestion: z.string().min(1),
    outcomes: z.array(
      z.object({
        code: visitOutcomeCodeSchema,
        label: z.string().min(1),
      })
    ).min(1),
  }),
});

export const workflowSubmissionSchema = z.object({
  campaignId: z.string().uuid(),
  selectedOutletRef: z.object({
    mode: z.enum(["existing", "new"]),
    outletId: z.string().uuid().optional(),
    outlet: z.object({
      name: z.string().optional(),
      outletType: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      state: z.string().optional(),
      lga: z.string().optional(),
    }).optional(),
  }),
  activityPayloads: z.array(z.object({
    activityId: workflowActivityIdSchema,
    payload: z.record(z.string(), z.unknown()),
  })),
  outcome: z.object({
    code: visitOutcomeCodeSchema,
    label: z.string().min(1),
  }),
  gps: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    locationAccuracy: z.number().optional(),
  }).optional(),
  photos: z.array(z.object({ fileName: z.string().optional() })).optional(),
  clientSubmissionMeta: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().min(8).optional(),
  clientCreatedAt: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  syncStatus: z.enum(["pending", "synced", "failed"]).optional(),
});
