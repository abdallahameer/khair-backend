import { Env, CORS } from '../types';

export async function handleFollowUser(userId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { follower_id: string };

	if (!body.follower_id) {
		return Response.json({ error: 'follower_id is required' }, { status: 400, headers: CORS });
	}

	if (body.follower_id === userId) {
		return Response.json({ error: 'You cannot follow yourself' }, { status: 400, headers: CORS });
	}

	try {
		await env.DB.prepare(`INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)`)
			.bind(body.follower_id, userId, new Date().toISOString())
			.run();
	} catch {
		// Already following — ignore
	}

	return Response.json({ message: 'followed' }, { headers: CORS });
}

export async function handleUnfollowUser(userId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { follower_id: string };

	if (!body.follower_id) {
		return Response.json({ error: 'follower_id is required' }, { status: 400, headers: CORS });
	}

	await env.DB.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).bind(body.follower_id, userId).run();

	return Response.json({ message: 'unfollowed' }, { headers: CORS });
}
