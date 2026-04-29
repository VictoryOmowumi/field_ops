import { z } from "zod";

export const outletSchema = z.object({
  name: z.string().min(2, "Outlet name is required"),
  outletType: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationAccuracy: z.number().optional(),
});

export type OutletFormValues = z.infer<typeof outletSchema>;
