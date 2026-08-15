import { Env, CORS } from '../types';
import { VIDEO_CATEGORIES, VideoCategory } from './videos';

// Replaces the user's full set of preferred categories in one atomic write.
// The caller sends the complete list they want — this is not additive.
export async function handleSetUserCategories(userId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { categories: string[] };

	if (!Array.isArray(body.categories) || body.categories.length === 0) {
		return Response.json({ error: 'At least one category is required' }, { status: 400, headers: CORS });
	}

	// Dedupe in case the client sends the same category twice
	const categories = Array.from(new Set(body.categories));

	const invalidCategory = categories.find((c) => !VIDEO_CATEGORIES.includes(c as VideoCategory));
	if (invalidCategory) {
		return Response.json({ error: `Invalid category: ${invalidCategory}` }, { status: 400, headers: CORS });
	}

	const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
	if (!user) {
		return Response.json({ error: 'User not found' }, { status: 404, headers: CORS });
	}

	const insertCategory = env.DB.prepare(`INSERT INTO user_category_preferences (user_id, category) VALUES (?, ?)`);

	// Clear the old set and insert the new one as ONE atomic transaction —
	// avoids ever leaving a user with a half-updated preference set
	try {
		await env.DB.batch([
			env.DB.prepare(`DELETE FROM user_category_preferences WHERE user_id = ?`).bind(userId),
			...categories.map((c) => insertCategory.bind(userId, c)),
		]);
	} catch (err) {
		console.error('Failed to save category preferences:', err);
		return Response.json({ error: 'Failed to save preferences' }, { status: 500, headers: CORS });
	}

	return Response.json({ categories }, { headers: CORS });
}

// Returns the user's currently saved categories as a plain string array.
// An empty array means this user has never set preferences yet — the
// frontend uses that to decide whether to show the blocking picker.
export async function handleGetUserCategories(userId: string, env: Env): Promise<Response> {
	const result = await env.DB.prepare(`SELECT category FROM user_category_preferences WHERE user_id = ?`).bind(userId).all();

	const categories = (result.results as { category: string }[]).map((row) => row.category);

	return Response.json({ categories }, { headers: CORS });
}
