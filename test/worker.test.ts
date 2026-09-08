import { describe, expect, it } from "vitest";
import worker from "../src/index";
import {
    createEnvironment,
    createFakeDatabase,
    createFakeRateLimiter,
    expectError,
} from "./support";

describe("worker routing and scheduled work", () => {
    it("limits the Worker to 100 requests per minute", async () => {
        const database = createFakeDatabase();
        const environment = createEnvironment(database.db, undefined, createFakeRateLimiter(100));

        for (let requestCount = 0; requestCount < 100; requestCount++) {
            const response = await worker.fetch(
                new Request("https://example.com/other"),
                environment,
            );
            expect(response.status).toBe(404);
        }

        const response = await worker.fetch(new Request("https://example.com/other"), environment);

        await expectError(
            response,
            429,
            "RATE_LIMIT_EXCEEDED",
            "Too many requests. Please try again later.",
        );
        expect(response.headers.get("retry-after")).toBe("60");
    });

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

    it("allows CORS preflight requests", async () => {
        const database = createFakeDatabase();
        const response = await worker.fetch(
            new Request("https://example.com/meals", {
                method: "OPTIONS",
                headers: {
                    Origin: "https://frontend.example.com",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type, x-menu-id",
                },
            }),
            createEnvironment(database.db),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
        expect(response.headers.get("access-control-allow-headers")).toBe(
            "Content-Type, X-Menu-Id",
        );
    });
});
