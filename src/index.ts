import { errorResponse } from "./http-response";
import { deleteMealsOlderThanSevenDays, handleGetMeals, handlePostMeals } from "./meals";
import { handleGetMenuId, handlePostMenuId } from "./menu-id";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        try {
            const { pathname } = new URL(request.url);

            if (pathname === "/menuId") {
                if (request.method === "GET") {
                    return await handleGetMenuId(env.SEED);
                }

                if (request.method === "POST") {
                    return await handlePostMenuId(request, env.SEED);
                }

                return errorResponse(
                    405,
                    "METHOD_NOT_ALLOWED",
                    `The ${request.method} method is not allowed for ${pathname}.`,
                    { headers: { Allow: "GET, POST" } },
                );
            }

            if (pathname === "/meals") {
                if (request.method === "GET") {
                    return await handleGetMeals(request, env.DB, env.SEED);
                }

                if (request.method === "POST") {
                    return await handlePostMeals(request, env.DB, env.SEED);
                }

                return errorResponse(
                    405,
                    "METHOD_NOT_ALLOWED",
                    `The ${request.method} method is not allowed for ${pathname}.`,
                    { headers: { Allow: "GET, POST" } },
                );
            }

            return errorResponse(404, "ROUTE_NOT_FOUND", "The requested route does not exist.");
        } catch {
            return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred.");
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
