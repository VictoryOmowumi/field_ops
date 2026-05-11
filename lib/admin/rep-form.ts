export type RepFormValues = {
  fullName: string;
  email: string;
  phone: string;
  selectedState: string;
  selectedLga: string;
  targetOutlets: string;
  targetConversions: string;
  assignedSupervisorUserId: string;
  notes: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  paymentType: string;
  dailyRate: string;
  commissionRate: string;
  selectedCampaignIds: string[];
};

export function createDefaultRepFormValues(): RepFormValues {
  return {
    fullName: "",
    email: "",
    phone: "",
    selectedState: "",
    selectedLga: "",
    targetOutlets: "",
    targetConversions: "",
    assignedSupervisorUserId: "none",
    notes: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
    paymentType: "",
    dailyRate: "",
    commissionRate: "",
    selectedCampaignIds: [],
  };
}

export function validateRepForm(values: RepFormValues): string | null {
  if (!values.fullName.trim()) return "Full name is required.";
  if (!values.email.trim()) return "Email is required.";
  return null;
}

export function buildCreateRepPayload(values: RepFormValues) {
  return {
    fullName: values.fullName,
    email: values.email,
    phone: values.phone || undefined,
    state: values.selectedState || undefined,
    lga: values.selectedLga || undefined,
    targetOutlets: values.targetOutlets ? Number(values.targetOutlets) : null,
    targetConversions: values.targetConversions ? Number(values.targetConversions) : null,
    assignedSupervisorUserId: values.assignedSupervisorUserId === "none" ? null : values.assignedSupervisorUserId,
    notes: values.notes || undefined,
    campaignIds: values.selectedCampaignIds,
    bankName: values.bankName || undefined,
    accountNumber: values.accountNumber || undefined,
    accountName: values.accountName || undefined,
    paymentType: values.paymentType || undefined,
    dailyRate: values.dailyRate ? Number(values.dailyRate) : null,
    commissionRate: values.commissionRate ? Number(values.commissionRate) : null,
  };
}
