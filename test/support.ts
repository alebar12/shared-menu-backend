import { expect } from "vitest";
import type { ApiErrorCode } from "../src/http-response";
import worker from "../src/index";

type StoredMeal = {
    menuId: string;
    day: string;
    mealType: string;
    meal: string;
};

export const SEED = "runtime-secret";

export async function expectError(
    response: Response,
    status: number,
    code: ApiErrorCode,
    message: string,
): Promise<void> {
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: { code, message } });
}

export function createFakeDatabase() {
    const meals: StoredMeal[] = [];
    const queries: string[] = [];
    const db = {
        prepare(query: string) {
            queries.push(query);
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
                run: async () => undefined,
                bind(...values: string[]) {
                    return {
                        run: async () => {
                            if (!query.startsWith("INSERT INTO MEALS")) return;

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
                        },
                    };
                },
            };
        },
    } as unknown as D1Database;

    return { db, getMeals: () => meals, getQueries: () => queries };
}

export function createFakeRateLimiter(limit = 100): RateLimit {
    let requestCount = 0;

    return {
        limit: async () => ({ success: ++requestCount <= limit }),
    } as RateLimit;
}

export function createEnvironment(
    db: D1Database,
    seed = SEED,
    rateLimiter = createFakeRateLimiter(),
): Env {
    return { DB: db, SEED: seed, REQUEST_RATE_LIMITER: rateLimiter };
}

export async function createMenuId(db: D1Database, seed = SEED): Promise<string> {
    const response = await worker.fetch(
        new Request("https://example.com/menuId"),
        createEnvironment(db, seed),
    );
    const { menuId } = (await response.json()) as { menuId: string };

    return menuId;
}
