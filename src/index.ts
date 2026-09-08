import z from "zod";
import { errorResponse } from "./http-response";
import { MealService } from "./MealService";
import { InvalidMenuIdError, MenuService } from "./MenuService";
import { Meal, mealRequestSchema, menuIdRequestSchema } from "./Objects";
import { Route, Router } from "./Router";

const RATE_LIMIT_KEY = "shared-menu";

function withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(Router.CORS_HEADERS)) headers.set(name, value);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function initServices(env: Env) {
    const menuService = new MenuService(env.SEED);
    const mealService = new MealService(env.DB, menuService);
    return { menuService, mealService };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
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

            const { menuService, mealService } = initServices(env);

            const router = new Router([
                new Route(
                    "/menuId",
                    "GET",
                    async request => undefined,
                    async () => Response.json({ menuId: await menuService.createMenuId() }),
                ),

                new Route<string>(
                    "/menuId",
                    "POST",
                    async request => {
                        const body = menuIdRequestSchema.parse(await request.json());
                        return body.menuId;
                    },
                    async menuId => {
                        await menuService.verifyMenuId(menuId);
                        return new Response(null, { status: 200 });
                    },
                ),

                new Route<string>(
                    "/meals",
                    "GET",
                    async request => request.headers.get("x-menu-id") ?? "",
                    async menuId => Response.json(await mealService.getMeals(menuId)),
                ),

                new Route<{
                    menuId: string;
                    meal: Meal;
                }>(
                    "/meals",
                    "POST",
                    async request => {
                        const body = mealRequestSchema.parse(await request.json());
                        return {
                            menuId: request.headers.get("x-menu-id") ?? "",
                            meal: body,
                        };
                    },
                    async requestData => {
                        await mealService.addMeal(requestData.menuId, requestData.meal);
                        return new Response(null, { status: 201 });
                    },
                ),
            ]);

            return withCors(await router.handle(request));
        } catch (error) {
            if (error instanceof InvalidMenuIdError) {
                return withCors(error.getErrorResponse());
            }
            if (error instanceof z.ZodError || error instanceof SyntaxError) {
                return withCors(
                    errorResponse(400, "INVALID_REQUEST", "The request payload is invalid."),
                );
            }
            return withCors(errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred."));
        }
    },

    async scheduled(
        _controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        console.log("Deleting old meals");
        const { menuService, mealService } = initServices(env);
        ctx.waitUntil(mealService.deleteMealsOlderThanSevenDays());
    },
} satisfies ExportedHandler<Env>;
