import { describe, expect, it } from "vitest";
import { InvalidMenuIdError, MenuService } from "../src/MenuService";
import worker from "../src/index";
import { createEnvironment, createFakeDatabase, expectError, SEED } from "./support";

describe("menu IDs", () => {
    it("returns a menuId signed by the runtime secret without querying D1 for a seed", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/menuId"),
            createEnvironment(database.db),
        );
        const body = (await response.json()) as { menuId: string };

        expect(response.status).toBe(200);
        expect(body.menuId).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
        await expect(new MenuService(SEED).verifyMenuId(body.menuId)).resolves.toBeUndefined();
        expect(database.getQueries().some(query => query.includes("SEED"))).toBe(false);
    });

    it("returns different menuIds signed by the same runtime secret", async () => {
        const database = createFakeDatabase();
        const firstResponse = await worker.fetch(
            new Request("https://example.com/menuId"),
            createEnvironment(database.db),
        );
        const secondResponse = await worker.fetch(
            new Request("https://example.com/menuId"),
            createEnvironment(database.db),
        );
        const firstBody = (await firstResponse.json()) as { menuId: string };
        const secondBody = (await secondResponse.json()) as { menuId: string };
        const menuService = new MenuService(SEED);

        expect(firstBody.menuId).not.toBe(secondBody.menuId);
        await expect(menuService.verifyMenuId(firstBody.menuId)).resolves.toBeUndefined();
        await expect(menuService.verifyMenuId(secondBody.menuId)).resolves.toBeUndefined();
    });

    it("accepts a menuId signed by the runtime secret", async () => {
        const database = createFakeDatabase();
        const createdResponse = await worker.fetch(
            new Request("https://example.com/menuId"),
            createEnvironment(database.db),
        );
        const { menuId } = (await createdResponse.json()) as { menuId: string };
        const response = await worker.fetch(
            new Request("https://example.com/menuId", {
                method: "POST",
                body: JSON.stringify({ menuId }),
            }),
            createEnvironment(database.db),
        );

        expect(response.status).toBe(200);
    });

    it("returns 401 for an invalid menuId", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/menuId", {
                method: "POST",
                body: JSON.stringify({ menuId: "not-a-valid-menu-id" }),
            }),
            createEnvironment(database.db),
        );

        await expectError(
            response,
            401,
            "INVALID_MENU_ID_REQUEST",
            "The supplied menu ID is missing or invalid.",
        );
    });

    it("returns 400 for an invalid JSON body", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/menuId", { method: "POST", body: "not-json" }),
            createEnvironment(database.db),
        );

        await expectError(response, 400, "INVALID_REQUEST", "The request payload is invalid.");
    });

    it("rejects a menuId when verified with a different seed", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/menuId"),
            createEnvironment(database.db),
        );
        const { menuId } = (await response.json()) as { menuId: string };

        await expect(new MenuService("wrong-seed").verifyMenuId(menuId)).rejects.toBeInstanceOf(
            InvalidMenuIdError,
        );
    });
});
