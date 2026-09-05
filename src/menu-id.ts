const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TEXT_ENCODER = new TextEncoder();

function encodeBase64Url(value: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(value));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
    if (!SIGNATURE_PATTERN.test(value)) return null;

    try {
        const base64 =
            value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
        return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    } catch {
        return null;
    }
}

async function createMenuId(seed: string): Promise<string> {
    const uuid = crypto.randomUUID();
    const key = await crypto.subtle.importKey(
        "raw",
        TEXT_ENCODER.encode(seed),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, TEXT_ENCODER.encode(uuid));

    return `${uuid}.${encodeBase64Url(signature)}`;
}

export async function verifyMenuId(menuId: string, seed: string): Promise<boolean> {
    const [uuid, encodedSignature, extraPart] = menuId.split(".");
    if (extraPart !== undefined || !UUID_V4_PATTERN.test(uuid)) return false;

    const signature = decodeBase64Url(encodedSignature);
    if (!signature) return false;

    const key = await crypto.subtle.importKey(
        "raw",
        TEXT_ENCODER.encode(seed),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
    );

    return crypto.subtle.verify("HMAC", key, signature, TEXT_ENCODER.encode(uuid));
}

export async function assertMenuIdMatchesSeed(menuId: string, seed: string): Promise<void> {
    if (!(await verifyMenuId(menuId, seed))) {
        throw new Error("menuId signature does not match the current seed");
    }
}

export async function isMenuIdValid(seed: string, menuId: string): Promise<boolean> {
    return verifyMenuId(menuId, seed);
}

async function readMenuIdFromBody(request: Request): Promise<string | null> {
    try {
        const body: unknown = await request.json();
        if (
            body === null ||
            typeof body !== "object" ||
            typeof (body as { menuId?: unknown }).menuId !== "string"
        ) {
            return null;
        }

        return (body as { menuId: string }).menuId;
    } catch {
        return null;
    }
}

export async function handleGetMenuId(seed: string): Promise<Response> {
    const menuId = await createMenuId(seed);
    await assertMenuIdMatchesSeed(menuId, seed);

    return Response.json({ menuId });
}

export async function handlePostMenuId(request: Request, seed: string): Promise<Response> {
    const menuId = await readMenuIdFromBody(request);

    if (!menuId || !(await isMenuIdValid(seed, menuId))) {
        return new Response("Bad Request", { status: 400 });
    }

    return new Response(null, { status: 200 });
}
