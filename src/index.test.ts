import { describe, expect, it } from "vitest";
import worker, { assertMenuIdMatchesSeed, verifyMenuId } from "./index";

type StoredMeal = {
    menuId: string;
    day: string;
    mealType: string;
    meal: string;
};

function createFakeDatabase(initialValue?: string) {
    let value = initialValue;
    const meals: StoredMeal[] = [];
    const db = {
        prepare(query: string) {
            if (query.startsWith("SELECT VALUE FROM SEED")) {
                return {
                    first: async () => (value === undefined ? null : { VALUE: value }),
                };
            }
            if (query.startsWith("SELECT DAY AS day")) {
                return {
                    bind(menuId: string) {
                        return {
                            all: async () => ({
                                results: meals
                                    .filter(meal => meal.menuId === menuId)
                                    .sort((firstMeal, secondMeal) =>
                                        firstMeal.day.localeCompare(secondMeal.day),
                                    )
                                    .map(({ day, mealType, meal }) => ({ day, mealType, meal })),
                            }),
                        };
                    },
                };
            }
            return {
                bind(...values: string[]) {
                    return {
                        run: async () => {
                            if (query.startsWith("INSERT INTO SEED") && value === undefined) {
                                value = values[0];
                            }
                            if (query.startsWith("INSERT INTO MEALS")) {
                                const [menuId, day, mealType, meal] = values;
                                const existingMeal = meals.find(
                                    storedMeal =>
                                        storedMeal.menuId === menuId &&
                                        storedMeal.day === day &&
                                        storedMeal.mealType === mealType,
                                );
                                if (existingMeal) {
                                    existingMeal.meal = meal;
                                } else {
                                    meals.push({ menuId, day, mealType, meal });
                                }
                            }
                        },
                    };
                },
            };
        },
    } as unknown as D1Database;

    return { db, getValue: () => value, getMeals: () => meals };
}

describe("/menuId", () => {
    it("creates the seed and returns a signed menuId when SEED is empty", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(new Request("https://example.com/menuId"), {
            DB: database.db,
        } as Env);
        const body = (await response.json()) as { menuId: string };
        const seed = database.getValue();

        expect(response.status).toBe(200);
        expect(seed).toMatch(/^[A-Za-z0-9]{64}$/);
        expect(body.menuId).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
        expect(await verifyMenuId(body.menuId, seed!)).toBe(true);
    });

    it("returns different menuIds signed by the same stored seed", async () => {
        const seed = "existing-seed";
        const database = createFakeDatabase(seed);
        const firstResponse = await worker.fetch(new Request("https://example.com/menuId"), {
            DB: database.db,
        } as Env);
        const secondResponse = await worker.fetch(new Request("https://example.com/menuId"), {
            DB: database.db,
        } as Env);
        const firstBody = (await firstResponse.json()) as { menuId: string };
        const secondBody = (await secondResponse.json()) as { menuId: string };

        expect(firstBody.menuId).not.toBe(secondBody.menuId);
        expect(await verifyMenuId(firstBody.menuId, seed)).toBe(true);
        expect(await verifyMenuId(secondBody.menuId, seed)).toBe(true);
        expect(database.getValue()).toBe(seed);
    });

    describe("POST /menuId", () => {
        it("returns 200 when menuId was signed by the stored seed", async () => {
            const seed = "correct-seed";
            const database = createFakeDatabase(seed);
            const createdResponse = await worker.fetch(new Request("https://example.com/menuId"), {
                DB: database.db,
            } as Env);
            const { menuId } = (await createdResponse.json()) as { menuId: string };
            const response = await worker.fetch(
                new Request("https://example.com/menuId", {
                    method: "POST",
                    body: JSON.stringify({ menuId }),
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(200);
        });

        it("returns 400 for an invalid menuId or invalid JSON body", async () => {
            const database = createFakeDatabase("correct-seed");
            const invalidMenuIdResponse = await worker.fetch(
                new Request("https://example.com/menuId", {
                    method: "POST",
                    body: JSON.stringify({ menuId: "not-a-valid-menu-id" }),
                }),
                { DB: database.db } as Env,
            );
            const invalidJsonResponse = await worker.fetch(
                new Request("https://example.com/menuId", {
                    method: "POST",
                    body: "not-json",
                }),
                { DB: database.db } as Env,
            );

            expect(invalidMenuIdResponse.status).toBe(400);
            expect(invalidJsonResponse.status).toBe(400);
        });
    });

    describe("POST /meals", () => {
        it("stores a meal for a valid menuId received in x-menu-id", async () => {
            const database = createFakeDatabase("correct-seed");
            const menuIdResponse = await worker.fetch(new Request("https://example.com/menuId"), {
                DB: database.db,
            } as Env);
            const { menuId } = (await menuIdResponse.json()) as { menuId: string };

            const response = await worker.fetch(
                new Request("https://example.com/meals", {
                    method: "POST",
                    headers: { "x-menu-id": menuId },
                    body: JSON.stringify({
                        day: "2026-09-04",
                        mealType: "LUNCH",
                        meal: "Pasta al pomodoro",
                    }),
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(201);
            expect(database.getMeals()).toEqual([
                {
                    menuId,
                    day: "2026-09-04",
                    mealType: "LUNCH",
                    meal: "Pasta al pomodoro",
                },
            ]);
        });

        it("updates meal when its menuId, day, and mealType already exist", async () => {
            const database = createFakeDatabase("correct-seed");
            const menuIdResponse = await worker.fetch(new Request("https://example.com/menuId"), {
                DB: database.db,
            } as Env);
            const { menuId } = (await menuIdResponse.json()) as { menuId: string };
            const requestOptions = {
                method: "POST",
                headers: { "x-menu-id": menuId },
            };

            await worker.fetch(
                new Request("https://example.com/meals", {
                    ...requestOptions,
                    body: JSON.stringify({
                        day: "2026-09-04",
                        mealType: "DINNER",
                        meal: "Risotto",
                    }),
                }),
                { DB: database.db } as Env,
            );
            const response = await worker.fetch(
                new Request("https://example.com/meals", {
                    ...requestOptions,
                    body: JSON.stringify({
                        day: "2026-09-04",
                        mealType: "DINNER",
                        meal: "Pizza",
                    }),
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(201);
            expect(database.getMeals()).toEqual([
                { menuId, day: "2026-09-04", mealType: "DINNER", meal: "Pizza" },
            ]);
        });

        it("returns 400 and does not store a meal for invalid requests", async () => {
            const database = createFakeDatabase("correct-seed");
            const response = await worker.fetch(
                new Request("https://example.com/meals", {
                    method: "POST",
                    headers: { "x-menu-id": "invalid-menu-id" },
                    body: JSON.stringify({
                        day: "2026-09-04",
                        mealType: "BREAKFAST",
                        meal: "Toast",
                    }),
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(400);
            expect(database.getMeals()).toEqual([]);
        });

        it("returns 400 and does not store a meal when day is not YYYY-MM-DD", async () => {
            const database = createFakeDatabase("correct-seed");
            const menuIdResponse = await worker.fetch(new Request("https://example.com/menuId"), {
                DB: database.db,
            } as Env);
            const { menuId } = (await menuIdResponse.json()) as { menuId: string };
            const response = await worker.fetch(
                new Request("https://example.com/meals", {
                    method: "POST",
                    headers: { "x-menu-id": menuId },
                    body: JSON.stringify({ day: "2026/09/04", mealType: "LUNCH", meal: "Toast" }),
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(400);
            expect(database.getMeals()).toEqual([]);
        });
    });

    describe("GET /meals", () => {
        it("returns only the specified menu's meals ordered by day", async () => {
            const database = createFakeDatabase("correct-seed");
            const firstMenuIdResponse = await worker.fetch(
                new Request("https://example.com/menuId"),
                {
                    DB: database.db,
                } as Env,
            );
            const secondMenuIdResponse = await worker.fetch(
                new Request("https://example.com/menuId"),
                {
                    DB: database.db,
                } as Env,
            );
            const { menuId } = (await firstMenuIdResponse.json()) as { menuId: string };
            const { menuId: otherMenuId } = (await secondMenuIdResponse.json()) as {
                menuId: string;
            };

            for (const [day, mealType, meal] of [
                ["2026-09-05", "DINNER", "Risotto"],
                ["2026-09-03", "LUNCH", "Pasta"],
            ]) {
                await worker.fetch(
                    new Request("https://example.com/meals", {
                        method: "POST",
                        headers: { "x-menu-id": menuId },
                        body: JSON.stringify({ day, mealType, meal }),
                    }),
                    { DB: database.db } as Env,
                );
            }
            await worker.fetch(
                new Request("https://example.com/meals", {
                    method: "POST",
                    headers: { "x-menu-id": otherMenuId },
                    body: JSON.stringify({ day: "2026-09-01", mealType: "LUNCH", meal: "Pizza" }),
                }),
                { DB: database.db } as Env,
            );

            const response = await worker.fetch(
                new Request("https://example.com/meals", {
                    headers: { "x-menu-id": menuId },
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual([
                { day: "2026-09-03", mealType: "LUNCH", meal: "Pasta" },
                { day: "2026-09-05", mealType: "DINNER", meal: "Risotto" },
            ]);
        });

        it("returns 400 when x-menu-id is invalid", async () => {
            const database = createFakeDatabase("correct-seed");
            const response = await worker.fetch(
                new Request("https://example.com/meals", {
                    headers: { "x-menu-id": "invalid-menu-id" },
                }),
                { DB: database.db } as Env,
            );

            expect(response.status).toBe(400);
        });
    });

    it("rejects a menuId when verified with a different seed", async () => {
        const database = createFakeDatabase("correct-seed");
        const response = await worker.fetch(new Request("https://example.com/menuId"), {
            DB: database.db,
        } as Env);
        const body = (await response.json()) as { menuId: string };

        expect(await verifyMenuId(body.menuId, "wrong-seed")).toBe(false);
        await expect(assertMenuIdMatchesSeed(body.menuId, "wrong-seed")).rejects.toThrow(
            "menuId signature does not match",
        );
    });

    it("returns 404 for every other path", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(new Request("https://example.com/other"), {
            DB: database.db,
        } as Env);

        expect(response.status).toBe(404);
    });

    it("returns 405 when a valid path is called with the wrong method", async () => {
        const database = createFakeDatabase("correct-seed");
        const menuIdResponse = await worker.fetch(
            new Request("https://example.com/menuId", { method: "DELETE" }),
            { DB: database.db } as Env,
        );
        const mealsResponse = await worker.fetch(
            new Request("https://example.com/meals", { method: "DELETE" }),
            { DB: database.db } as Env,
        );

        expect(menuIdResponse.status).toBe(405);
        expect(mealsResponse.status).toBe(405);
    });
});
