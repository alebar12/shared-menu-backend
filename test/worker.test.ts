import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { createEnvironment, createFakeDatabase, expectError } from "./support";

describe("worker routing and scheduled work", () => {
    it("deletes meals older than seven days when scheduled", async () => {
        const database = createFakeDatabase();
        let cleanup: Promise<unknown> | undefined;

        await worker.scheduled({} as ScheduledController, createEnvironment(database.db), {
            waitUntil: promise => {
                cleanup = promise;
            },
        } as ExecutionContext);
        await cleanup;

        expect(database.getQueries()).toContain(
            "DELETE FROM MEALS WHERE DAY < date('now', '-7 days')",
        );
    });

    it("returns 404 for an unknown route", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/other"),
            createEnvironment(database.db),
        );

        await expectError(response, 404, "ROUTE_NOT_FOUND", "The requested route does not exist.");
    });

    it("returns 405 with allowed methods for unsupported methods", async () => {
        const database = createFakeDatabase();
        const menuIdResponse = await worker.fetch(
            new Request("https://example.com/menuId", { method: "DELETE" }),
            createEnvironment(database.db),
        );
        const mealsResponse = await worker.fetch(
            new Request("https://example.com/meals", { method: "DELETE" }),
            createEnvironment(database.db),
        );

        await expectError(
            menuIdResponse,
            405,
            "METHOD_NOT_ALLOWED",
            "The DELETE method is not allowed for /menuId.",
        );
        await expectError(
            mealsResponse,
            405,
            "METHOD_NOT_ALLOWED",
            "The DELETE method is not allowed for /meals.",
        );
        expect(menuIdResponse.headers.get("allow")).toBe("GET, POST");
        expect(mealsResponse.headers.get("allow")).toBe("GET, POST");
    });
});
