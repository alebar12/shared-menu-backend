export type ApiErrorCode =
    | "INTERNAL_ERROR"
    | "INVALID_MEAL"
    | "INVALID_MENU_ID_REQUEST"
    | "METHOD_NOT_ALLOWED"
    | "RATE_LIMIT_EXCEEDED"
    | "ROUTE_NOT_FOUND"
    | "WRONG_MENU_ID";

type ErrorResponseOptions = {
    headers?: HeadersInit;
};

export function errorResponse(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: ErrorResponseOptions = {},
): Response {
    return Response.json({ error: { code, message } }, { status, headers: options.headers });
}
