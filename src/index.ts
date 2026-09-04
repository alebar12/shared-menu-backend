const ALPHANUMERIC_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

type SeedRow = {
	VALUE: string;
};

function createRandomValue(length: number): string {
	let result = '';
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
	return db.prepare('SELECT VALUE FROM SEED LIMIT 1').first<SeedRow>();
}

async function getMenuId(db: D1Database): Promise<string> {
	const existingSeed = await readSeedValue(db);
	if (existingSeed) return existingSeed.VALUE;

	const candidate = createRandomValue(64);
	await db
		.prepare('INSERT INTO SEED (VALUE) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM SEED)')
		.bind(candidate)
		.run();

	const storedSeed = await readSeedValue(db);
	if (!storedSeed) throw new Error('Unable to initialize SEED');

	return storedSeed.VALUE;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (new URL(request.url).pathname === '/menuId') {
			return Response.json({ seed: await getMenuId(env.DB) });	
		}

		return new Response('Not Found', { status: 404 });		
	},
	} satisfies ExportedHandler<Env>;
