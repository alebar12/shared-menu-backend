import { errorResponse } from "./http-response";
import { deleteMealsOlderThanSevenDays, handleGetMeals, handlePostMeals } from "./meals";
import { handleGetMenuId, handlePostMenuId } from "./menu-id";

const RATE_LIMIT_KEY = "shared-menu";
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Menu-Id",
};

function withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        try {
            const { success } = await env.REQUEST_RATE_LIMITER.limit({ key: RATE_LIMIT_KEY });
            if (!success) {
                return withCors(
                    errorResponse(
                        429,
                        "RATE_LIMIT_EXCEEDED",
                        "Too many requests. Please try again later.",
                        { headers: { "Retry-After": "60" } },
                    ),
                );
            }

            const { pathname } = new URL(request.url);

            if (pathname === "/menuId") {
                if (request.method === "GET") {
                    return withCors(await handleGetMenuId(env.SEED));
                }

                if (request.method === "POST") {
                    return withCors(await handlePostMenuId(request, env.SEED));
                }

                return withCors(
                    errorResponse(
                        405,
                        "METHOD_NOT_ALLOWED",
                        `The ${request.method} method is not allowed for ${pathname}.`,
                        { headers: { Allow: "GET, POST, OPTIONS" } },
                    ),
                );
            }

            if (pathname === "/meals") {
                if (request.method === "GET") {
                    return withCors(await handleGetMeals(request, env.DB, env.SEED));
                }

                if (request.method === "POST") {
                    return withCors(await handlePostMeals(request, env.DB, env.SEED));
                }

                return withCors(
                    errorResponse(
                        405,
                        "METHOD_NOT_ALLOWED",
                        `The ${request.method} method is not allowed for ${pathname}.`,
                        { headers: { Allow: "GET, POST, OPTIONS" } },
                    ),
                );
            }

            return withCors(
                errorResponse(404, "ROUTE_NOT_FOUND", "The requested route does not exist."),
            );
        } catch {
            return withCors(errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred."));
        }
    },

    async scheduled(
        _controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        console.log("Deleting old meals");
        ctx.waitUntil(deleteMealsOlderThanSevenDays(env.DB));
    },
} satisfies ExportedHandler<Env>;
