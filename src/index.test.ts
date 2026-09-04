import { describe, expect, it } from 'vitest';
import worker from './index';

function createFakeDatabase(initialValue?: string) {
	let value = initialValue;
	const db = {
		prepare(query: string) {
			if (query.startsWith('SELECT')) {
				return { first: async () => (value === undefined ? null : { VALUE: value }) };
			}
			return {
				bind(candidate: string) {
					return {
						run: async () => {
							if (value === undefined) value = candidate;
						},
					};
				},
			};
		},
	} as unknown as D1Database;

	return { db, getValue: () => value };
}

describe('/menuId', () => {
	it('creates and returns a 64-character alphanumeric value when SEED is empty', async () => {
		const database = createFakeDatabase();
		const response = await worker.fetch(new Request('https://example.com/menuId'), { DB: database.db } as Env);
		const body = (await response.json()) as { seed: string };

		expect(response.status).toBe(200);
		expect(body.seed).toMatch(/^[A-Za-z0-9]{64}$/);
		expect(database.getValue()).toBe(body.seed);
	});

	it('returns the stored value without replacing it', async () => {
		const database = createFakeDatabase('existing-menu-id');
		const response = await worker.fetch(new Request('https://example.com/menuId'), { DB: database.db } as Env);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ seed: 'existing-menu-id' });
		expect(database.getValue()).toBe('existing-menu-id');
	});

	it('returns 404 for every other path', async () => {
		const database = createFakeDatabase();
		const response = await worker.fetch(new Request('https://example.com/other'), { DB: database.db } as Env);

		expect(response.status).toBe(404);
	});
});