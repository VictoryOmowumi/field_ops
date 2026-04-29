import { z } from "zod";

export const saleSchema = z.object({
  outletId: z.string().min(1, "Outlet is required"),
  productId: z.string().min(1, "Product is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  price: z.number().nonnegative().optional(),
  conversionStatus: z.enum(["converted", "pending", "revisit"]),
  notes: z.string().optional(),
});

export type SaleFormValues = z.infer<typeof saleSchema>;
