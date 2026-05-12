export type OrgBrand = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  faviconIcoUrl?: string | null;
  favicon16Url?: string | null;
  favicon32Url?: string | null;
  appleTouchIconUrl?: string | null;
  android192Url?: string | null;
  android512Url?: string | null;
  manifestUrl?: string | null;
};

export const BRAND_COOKIE_SLUG = "actiq_org_slug";
export const BRAND_COOKIE_NAME = "actiq_org_name";
export const BRAND_COOKIE_LOGO = "actiq_org_logo";
