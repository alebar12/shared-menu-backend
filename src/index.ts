import { deleteMealsOlderThanSevenDays, handleGetMeals, handlePostMeals } from "./meals";
import { handleGetMenuId, handlePostMenuId } from "./menu-id";

export { assertMenuIdMatchesSeed, verifyMenuId } from "./menu-id";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const { pathname } = new URL(request.url);

        if (pathname === "/menuId") {
            if (request.method === "GET") {
                return handleGetMenuId(env.DB);
            }

            if (request.method === "POST") {
                return handlePostMenuId(request, env.DB);
            }

            return new Response("Method Not Allowed", { status: 405 });
        }

        if (pathname === "/meals") {
            if (request.method === "GET") {
                return handleGetMeals(request, env.DB);
            }

            if (request.method === "POST") {
                return handlePostMeals(request, env.DB);
            }

            return new Response("Method Not Allowed", { status: 405 });
        }

        return new Response("Not Found", { status: 404 });
    },


    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log("Deleting old meals");
        ctx.waitUntil(deleteMealsOlderThanSevenDays(env.DB));
    },
} satisfies ExportedHandler<Env>;
