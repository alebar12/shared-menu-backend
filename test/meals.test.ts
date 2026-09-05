import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { createEnvironment, createFakeDatabase, createMenuId, expectError } from "./support";

async function postMeal(db: D1Database, menuId: string, body: unknown): Promise<Response> {
    return worker.fetch(
        new Request("https://example.com/meals", {
            method: "POST",
            headers: { "x-menu-id": menuId },
            body: JSON.stringify(body),
        }),
        createEnvironment(db),
    );
}

describe("meals", () => {
    it("stores a meal for a valid menuId", async () => {
        const database = createFakeDatabase();
        const menuId = await createMenuId(database.db);
        const response = await postMeal(database.db, menuId, {
            day: "2026-09-04",
            mealType: "LUNCH",
            meal: "Pasta al pomodoro",
        });

        expect(response.status).toBe(201);
        expect(database.getMeals()).toEqual([
            { menuId, day: "2026-09-04", mealType: "LUNCH", meal: "Pasta al pomodoro" },
        ]);
    });

    it("updates a meal when its menuId, day, and mealType already exist", async () => {
        const database = createFakeDatabase();
        const menuId = await createMenuId(database.db);
        await postMeal(database.db, menuId, {
            day: "2026-09-04",
            mealType: "DINNER",
            meal: "Risotto",
        });
        const response = await postMeal(database.db, menuId, {
            day: "2026-09-04",
            mealType: "DINNER",
            meal: "Pizza",
        });

        expect(response.status).toBe(201);
        expect(database.getMeals()).toEqual([
            { menuId, day: "2026-09-04", mealType: "DINNER", meal: "Pizza" },
        ]);
    });

    it("returns 401 and does not store a meal for an invalid menuId", async () => {
        const database = createFakeDatabase();
        const response = await postMeal(database.db, "invalid-menu-id", {
            day: "2026-09-04",
            mealType: "BREAKFAST",
            meal: "Toast",
        });

        await expectError(
            response,
            401,
            "WRONG_MENU_ID",
            "The supplied menu ID is missing or invalid.",
        );
        expect(database.getMeals()).toEqual([]);
    });

    it("returns 400 and does not store a meal for an invalid payload", async () => {
        const database = createFakeDatabase();
        const menuId = await createMenuId(database.db);
        const response = await postMeal(database.db, menuId, {
            day: "2026-09-04",
            mealType: "BREAKFAST",
            meal: "Toast",
        });

        await expectError(response, 400, "INVALID_MEAL", "The meal payload is invalid.");
        expect(database.getMeals()).toEqual([]);
    });

    it("returns 400 and does not store a meal when day is not YYYY-MM-DD", async () => {
        const database = createFakeDatabase();
        const menuId = await createMenuId(database.db);
        const response = await postMeal(database.db, menuId, {
            day: "2026/09/04",
            mealType: "LUNCH",
            meal: "Toast",
        });

        await expectError(response, 400, "INVALID_MEAL", "The meal payload is invalid.");
        expect(database.getMeals()).toEqual([]);
    });

    it("returns only the specified menu's meals ordered by day", async () => {
        const database = createFakeDatabase();
        const menuId = await createMenuId(database.db);
        const otherMenuId = await createMenuId(database.db);
        await postMeal(database.db, menuId, {
            day: "2026-09-05",
            mealType: "DINNER",
            meal: "Risotto",
        });
        await postMeal(database.db, menuId, {
            day: "2026-09-03",
            mealType: "LUNCH",
            meal: "Pasta",
        });
        await postMeal(database.db, otherMenuId, {
            day: "2026-09-01",
            mealType: "LUNCH",
            meal: "Pizza",
        });

        const response = await worker.fetch(
            new Request("https://example.com/meals", { headers: { "x-menu-id": menuId } }),
            createEnvironment(database.db),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual([
            { day: "2026-09-03", mealType: "LUNCH", meal: "Pasta" },
            { day: "2026-09-05", mealType: "DINNER", meal: "Risotto" },
        ]);
    });

    it("returns 401 when x-menu-id is invalid", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/meals", {
                headers: { "x-menu-id": "invalid-menu-id" },
            }),
            createEnvironment(database.db),
        );

        await expectError(
            response,
            401,
            "WRONG_MENU_ID",
            "The supplied menu ID is missing or invalid.",
        );
    });

    it("returns a safe 500 response when the database fails", async () => {
        const database = {
            prepare() {
                throw new Error("database connection failed");
            },
        } as unknown as D1Database;
        const menuId = await createMenuId(database);
        const response = await worker.fetch(
            new Request("https://example.com/meals", { headers: { "x-menu-id": menuId } }),
            createEnvironment(database),
        );

        await expectError(response, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
    });
});
