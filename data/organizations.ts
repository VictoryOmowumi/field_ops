export type OrganizationStatus = "Active" | "Suspended" | "Trial" | "Archived";

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  industry: string;
  businessType: string;
  logoUrl?: string;
  website?: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  primaryAdminName: string;
  primaryAdminEmail: string;
  primaryAdminPhone: string;
  country: string;
  timezone: string;
  currency: string;
  status: OrganizationStatus;
  plan: "Starter" | "Growth" | "Enterprise";
  billingEmail?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  createdAt: string;
  totalCampaigns: number;
  totalReps: number;
  totalOutlets: number;
  totalSales: number;
  storageUsage: string;
  monthlyActivity: string;
}

export const organizations: OrganizationRecord[] = [
  {
    id: "org-001",
    name: "Acme Beverages",
    slug: "acme-beverages",
    industry: "FMCG",
    businessType: "Distributor",
    primaryContactEmail: "ops@acmebev.com",
    primaryContactPhone: "+2348030001001",
    primaryAdminName: "Tolu Balogun",
    primaryAdminEmail: "tolu@acmebev.com",
    primaryAdminPhone: "+2348030001222",
    country: "Nigeria",
    timezone: "Africa/Lagos",
    currency: "NGN",
    status: "Active",
    plan: "Growth",
    billingEmail: "finance@acmebev.com",
    brandPrimaryColor: "#0F766E",
    brandSecondaryColor: "#0EA5E9",
    createdAt: "Apr 11, 2026",
    totalCampaigns: 8,
    totalReps: 122,
    totalOutlets: 1386,
    totalSales: 8421,
    storageUsage: "24.6 GB",
    monthlyActivity: "High",
  },
  {
    id: "org-002",
    name: "Golden Basket",
    slug: "golden-basket",
    industry: "Retail",
    businessType: "Chain",
    primaryContactEmail: "operations@goldenbasket.ng",
    primaryContactPhone: "+2348030002001",
    primaryAdminName: "Ada James",
    primaryAdminEmail: "ada@goldenbasket.ng",
    primaryAdminPhone: "+2348030002888",
    country: "Nigeria",
    timezone: "Africa/Lagos",
    currency: "NGN",
    status: "Active",
    plan: "Starter",
    billingEmail: "billing@goldenbasket.ng",
    brandPrimaryColor: "#1D4ED8",
    brandSecondaryColor: "#F59E0B",
    createdAt: "Mar 22, 2026",
    totalCampaigns: 5,
    totalReps: 76,
    totalOutlets: 942,
    totalSales: 5104,
    storageUsage: "13.2 GB",
    monthlyActivity: "Medium",
  },
  {
    id: "org-003",
    name: "Prime Consumer Goods",
    slug: "prime-consumer",
    industry: "Consumer Goods",
    businessType: "Manufacturer",
    primaryContactEmail: "hello@primeconsumer.ng",
    primaryContactPhone: "+2348030003001",
    primaryAdminName: "Mary Okon",
    primaryAdminEmail: "mary@primeconsumer.ng",
    primaryAdminPhone: "+2348030003666",
    country: "Nigeria",
    timezone: "Africa/Lagos",
    currency: "NGN",
    status: "Trial",
    plan: "Enterprise",
    billingEmail: "accounts@primeconsumer.ng",
    brandPrimaryColor: "#7C2D12",
    brandSecondaryColor: "#B45309",
    createdAt: "May 04, 2026",
    totalCampaigns: 0,
    totalReps: 0,
    totalOutlets: 0,
    totalSales: 0,
    storageUsage: "0.2 GB",
    monthlyActivity: "Low",
  },
];

export function getOrganizationById(id: string) {
  return organizations.find((org) => org.id === id) ?? organizations[0];
}
