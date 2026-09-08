import { errorResponse } from "./http-response";

type RequestParser<TRequestDto> = (request: Request) => TRequestDto | Promise<TRequestDto>;
type RouteHandler<TRequestDto> = (requestDto: TRequestDto) => Promise<Response>;

export class Router {
    public static CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Menu-Id",
        "Access-Control-Max-Age": "86400",
    };

    constructor(
        private readonly routes: Routable[],
        private readonly allowOptions: boolean = true,
    ) {}

    async handle(request: Request): Promise<Response> {
        const { pathname } = new URL(request.url);
        const method = request.method;

        if (method === "OPTIONS" && this.allowOptions) {
            return new Response(null, { status: 204, headers: Router.CORS_HEADERS });
        }

        const routesByPath = this.routes.filter(route => route.path === pathname);
        if (routesByPath.length === 0) {
            return errorResponse(404, "ROUTE_NOT_FOUND", "The requested route does not exist.");
        }

        const route = routesByPath.find(route => route.method === method);
        if (!route) {
            return errorResponse(
                405,
                "METHOD_NOT_ALLOWED",
                `The ${method} method is not allowed for ${pathname}.`,
                { headers: { Allow: routesByPath.map(route => route.method).join(", ") } },
            );
        }

        return await route.handle(request);
    }
}

interface Routable {
    readonly path: string;
    readonly method: string;
    handle(request: Request): Promise<Response>;
}

export class Route<TRequestDto = undefined> implements Routable {
    constructor(
        public readonly path: string,
        public readonly method: string,
        private readonly parseRequest: RequestParser<TRequestDto>,
        private readonly handler: RouteHandler<TRequestDto>,
    ) {}

    async handle(request: Request): Promise<Response> {
        const requestDto = await this.parseRequest(request);
        return this.handler(requestDto);
    }
}
