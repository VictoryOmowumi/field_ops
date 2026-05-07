export type SyncStatus = "draft" | "pending_sync" | "syncing" | "synced" | "failed";

export type VisitOutcome =
  | "registered_only"
  | "converted"
  | "pending"
  | "revisit"
  | "no_sale"
  | "no_interest";

export type CampaignSectionType =
  | "outlet_information"
  | "product_audit"
  | "sales_conversion"
  | "survey_questions"
  | "photo_evidence"
  | "gps_verification"
  | "notes";

export type CampaignFieldType =
  | "text"
  | "textarea"
  | "number"
  | "phone"
  | "select"
  | "multi_select"
  | "radio"
  | "checkbox"
  | "yes_no"
  | "currency"
  | "product_selector"
  | "price_input"
  | "photo"
  | "gps"
  | "date";

export interface CampaignProduct {
  id: string;
  sku?: string;
  name: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignFormFieldOption {
  label: string;
  value: string;
}

export interface CampaignFormFieldDependency {
  fieldName: string;
  value: string;
}

export interface CampaignFormField {
  id: string;
  name: string;
  label: string;
  type: CampaignFieldType;
  placeholder?: string;
  required: boolean;
  options?: CampaignFormFieldOption[];
  dependsOn?: CampaignFormFieldDependency;
  metadata?: Record<string, unknown>;
}

export interface CampaignFormSection {
  id: string;
  title: string;
  description?: string;
  type: CampaignSectionType;
  required: boolean;
  order: number;
  fields: CampaignFormField[];
}

export interface CampaignTaskForm {
  id: string;
  organizationId: string;
  campaignId: string;
  title: string;
  description?: string;
  products?: CampaignProduct[];
  sections: CampaignFormSection[];
  settings: {
    requireGps: boolean;
    requirePhotoEvidence: boolean;
    minimumPhotos: number;
    maximumPhotos: number;
    allowExistingOutletSelection: boolean;
    allowNewOutletRegistration: boolean;
    nearbyOutletRadiusMeters: number;
    allowedOutcomes: VisitOutcome[];
  };
}

export interface VisitAnswer {
  fieldName: string;
  value: unknown;
}

export interface VisitPhoto {
  id: string;
  fieldName?: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  previewUrl?: string;
  file?: File;
}

export interface VisitSubmission {
  id: string;
  organizationId: string;
  campaignId: string;
  agentId: string;
  outletId?: string;
  outletMode: "existing" | "new";
  outcome: VisitOutcome;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  answers: VisitAnswer[];
  photos: VisitPhoto[];
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NearbyOutlet {
  id: string;
  name: string;
  distanceMeters: number;
  address?: string;
  lga?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}
