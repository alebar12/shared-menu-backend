import { isMenuIdValid } from "./menu-id";

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

type Meal = {
    day: string;
    mealType: "LUNCH" | "DINNER";
    meal: string;
};

async function readMealFromBody(request: Request): Promise<Meal | null> {
    try {
        const body: unknown = await request.json();
        if (
            body === null ||
            typeof body !== "object" ||
            typeof (body as { day?: unknown }).day !== "string" ||
            typeof (body as { mealType?: unknown }).mealType !== "string" ||
            typeof (body as { meal?: unknown }).meal !== "string"
        ) {
            return null;
        }

        const { day, mealType, meal } = body as { day: string; mealType: string; meal: string };
        if (!DATE_PATTERN.test(day) || (mealType !== "LUNCH" && mealType !== "DINNER")) return null;

        return { day, mealType, meal };
    } catch {
        return null;
    }
}

export async function handlePostMeals(request: Request, db: D1Database): Promise<Response> {
    const menuId = request.headers.get("x-menu-id");
    const meal = await readMealFromBody(request);

    if (!menuId || !meal || !(await isMenuIdValid(db, menuId))) {
        return new Response("Bad Request", { status: 400 });
    }

    await db
        .prepare(
            "INSERT INTO MEALS (MENU_ID, DAY, MEAL_TYPE, MEAL) VALUES (?, ?, ?, ?) " +
                "ON CONFLICT (MENU_ID, DAY, MEAL_TYPE) DO UPDATE SET MEAL = excluded.MEAL",
        )
        .bind(menuId, meal.day, meal.mealType, meal.meal)
        .run();

    return new Response(null, { status: 201 });
}
