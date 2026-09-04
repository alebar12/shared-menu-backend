import { describe, expect, it } from "vitest";
import worker, { assertMenuIdMatchesSeed, verifyMenuId } from "./index";

function createFakeDatabase(initialValue?: string) {
    let value = initialValue;
    const db = {
        prepare(query: string) {
            if (query.startsWith("SELECT")) {
                return {
                    first: async () => (value === undefined ? null : { VALUE: value }),
                };
            }
            return {
                bind(candidate: string) {
                    return {
                        run: async () => {
                            if (value === undefined) value = candidate;
                        },
                    };
                },
            };
        },
    } as unknown as D1Database;

    return { db, getValue: () => value };
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

    describe("POST /verifyMenuId", () => {
        it("returns 200 when menuId was signed by the stored seed", async () => {
            const seed = "correct-seed";
            const database = createFakeDatabase(seed);
            const createdResponse = await worker.fetch(new Request("https://example.com/menuId"), {
                DB: database.db,
            } as Env);
            const { menuId } = (await createdResponse.json()) as { menuId: string };
            const response = await worker.fetch(
                new Request("https://example.com/verifyMenuId", {
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
                new Request("https://example.com/verifyMenuId", {
                    method: "POST",
                    body: JSON.stringify({ menuId: "not-a-valid-menu-id" }),
                }),
                { DB: database.db } as Env,
            );
            const invalidJsonResponse = await worker.fetch(
                new Request("https://example.com/verifyMenuId", {
                    method: "POST",
                    body: "not-json",
                }),
                { DB: database.db } as Env,
            );

            expect(invalidMenuIdResponse.status).toBe(400);
            expect(invalidJsonResponse.status).toBe(400);
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
            new Request("https://example.com/menuId", { method: "POST" }),
            { DB: database.db } as Env,
        );
        const verifyResponse = await worker.fetch(new Request("https://example.com/verifyMenuId"), {
            DB: database.db,
        } as Env);

        expect(menuIdResponse.status).toBe(405);
        expect(verifyResponse.status).toBe(405);
    });
});
