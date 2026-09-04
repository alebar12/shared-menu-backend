const ALPHANUMERIC_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TEXT_ENCODER = new TextEncoder();

type SeedRow = {
    VALUE: string;
};

type Meal = {
    day: string;
    mealType: "LUNCH" | "DINNER";
    meal: string;
};

function createRandomValue(length: number): string {
    let result = "";
    const bytes = new Uint8Array(length);

    while (result.length < length) {
        crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte < 248) {
                result += ALPHANUMERIC_CHARACTERS[byte % ALPHANUMERIC_CHARACTERS.length];
            }
            if (result.length === length) break;
        }
    }

    return result;
}

async function readSeedValue(db: D1Database): Promise<SeedRow | null> {
    return db.prepare("SELECT VALUE FROM SEED LIMIT 1").first<SeedRow>();
}

async function getSeed(db: D1Database): Promise<string> {
    const existingSeed = await readSeedValue(db);
    if (existingSeed) return existingSeed.VALUE;

    const candidate = createRandomValue(64);
    await db
        .prepare("INSERT INTO SEED (VALUE) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM SEED)")
        .bind(candidate)
        .run();

    const storedSeed = await readSeedValue(db);
    if (!storedSeed) throw new Error("Unable to initialize SEED");

    return storedSeed.VALUE;
}

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

async function readMealFromBody(request: Request): Promise<Meal | null> {
    try {
        const body: unknown = await request.json();
        if (
            body === null ||
            typeof body !== "object" ||
            typeof (body as { day?: unknown }).day !== "string" ||
            typeof (body as { mealType?: unknown }).mealType !== "string" ||
            typeof (body as { meal?: unknown }).meal !== "string"
        ) {
            return null;
        }

        const { day, mealType, meal } = body as { day: string; mealType: string; meal: string };
        if (!DATE_PATTERN.test(day) || (mealType !== "LUNCH" && mealType !== "DINNER")) return null;

        return { day, mealType, meal };
    } catch {
        return null;
    }
}

async function handleGetMenuId(db: D1Database): Promise<Response> {
    const seed = await getSeed(db);
    const menuId = await createMenuId(seed);
    await assertMenuIdMatchesSeed(menuId, seed);

    return Response.json({ menuId });
}

async function handlePostMenuId(request: Request, db: D1Database): Promise<Response> {
    const menuId = await readMenuIdFromBody(request);
    const seed = await readSeedValue(db);

    if (!menuId || !seed || !(await verifyMenuId(menuId, seed.VALUE))) {
        return new Response("Bad Request", { status: 400 });
    }

    return new Response(null, { status: 200 });
}

async function handlePostMeals(request: Request, db: D1Database): Promise<Response> {
    const menuId = request.headers.get("x-menu-id");
    const meal = await readMealFromBody(request);
    const seed = await readSeedValue(db);

    if (!menuId || !meal || !seed || !(await verifyMenuId(menuId, seed.VALUE))) {
        return new Response("Bad Request", { status: 400 });
    }

    await db
        .prepare(
            "INSERT INTO MEALS (MENU_ID, DAY, MEAL_TYPE, MEAL) VALUES (?, ?, ?, ?) " +
                "ON CONFLICT (MENU_ID, DAY, MEAL_TYPE) DO UPDATE SET MEAL = excluded.MEAL",
        )
        .bind(menuId, meal.day, meal.mealType, meal.meal)
        .run();

    return new Response(null, { status: 201 });
}

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
            if (request.method === "POST") {
                return handlePostMeals(request, env.DB);
            }

            return new Response("Method Not Allowed", { status: 405 });
        }

        return new Response("Not Found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;
