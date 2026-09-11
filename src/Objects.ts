import z from "zod";

export const menuIdRequestSchema = z.object({ menuId: z.string() });

export const mealRequestSchema = z.object({
    day: z.iso.date(),
    mealType: z.enum(["LUNCH", "DINNER"]),
    meal: z.string().max(1024),
});

export type Meal = z.infer<typeof mealRequestSchema>;
