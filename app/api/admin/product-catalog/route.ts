import { NextRequest, NextResponse } from "next/server";

import { nigeriaProductCatalog } from "@/data/nigeria-product-catalog";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) {
    return forbidden();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_catalog")
    .select("id, organization_id, name, brand, category, industry, created_at")
    .or(`organization_id.eq.${membership.organizationId},organization_id.is.null`)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const dbItems = data ?? [];
  const mergedMap = new Map<string, { name: string; brand?: string; category?: string; industry?: string }>();

  for (const item of nigeriaProductCatalog) {
    mergedMap.set(item.name.toLowerCase(), {
      name: item.name,
      brand: item.brand,
      category: item.category,
      industry: item.industry,
    });
  }

  for (const item of dbItems) {
    mergedMap.set(item.name.toLowerCase(), {
      name: item.name,
      brand: item.brand ?? undefined,
      category: item.category ?? undefined,
      industry: item.industry ?? undefined,
    });
  }

  const products = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ success: true, products });
}

type CreateProductPayload = {
  name: string;
  brand?: string;
  category?: string;
  industry?: string;
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) {
    return forbidden();
  }

  const payload = (await request.json()) as CreateProductPayload;
  const name = payload.name?.trim();
  if (!name) {
    return NextResponse.json({ success: false, message: "Product name is required." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("product_catalog")
    .select("id, name")
    .eq("organization_id", membership.organizationId)
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      success: true,
      product: existing,
      alreadyExists: true,
    });
  }

  const { data, error } = await supabase
    .from("product_catalog")
    .insert({
      organization_id: membership.organizationId,
      name,
      brand: payload.brand?.trim() || null,
      category: payload.category?.trim() || null,
      industry: payload.industry?.trim() || null,
      created_by: user.id,
    })
    .select("id, name, brand, category, industry, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, message: error?.message ?? "Failed to create product." }, { status: 500 });
  }

  return NextResponse.json({ success: true, product: data }, { status: 201 });
}

