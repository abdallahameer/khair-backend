import { Env, CORS } from '../types';

// ─── Likes ──────────────────────────────────────────────────────────────────

export async function handleLikeVideo(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string };

	if (!body.user_id) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	try {
		await env.DB.prepare(`INSERT INTO likes (user_id, video_id) VALUES (?, ?)`).bind(body.user_id, videoId).run();
	} catch {
		// Already liked — ignore (primary key conflict)
	}

	return Response.json({ message: 'liked' }, { headers: CORS });
}

export async function handleUnlikeVideo(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string };

	if (!body.user_id) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	await env.DB.prepare(`DELETE FROM likes WHERE user_id = ? AND video_id = ?`).bind(body.user_id, videoId).run();

	return Response.json({ message: 'unliked' }, { headers: CORS });
}

export async function handleGetVideoLikes(videoId: string, env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT users.id, users.username, users.profile_image
     FROM likes
     JOIN users ON likes.user_id = users.id
     WHERE likes.video_id = ?
     ORDER BY likes.created_at DESC`,
	)
		.bind(videoId)
		.all();

	return Response.json(result.results, { headers: CORS });
}

export async function handleGetUserLikedVideos(userId: string, env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT videos.id, videos.video_url, videos.uploaded_at, users.id as user_id, users.username
     FROM likes
     JOIN videos ON likes.video_id = videos.id
     JOIN users ON videos.user_id = users.id
     WHERE likes.user_id = ?
     ORDER BY likes.created_at DESC`,
	)
		.bind(userId)
		.all();

	return Response.json(result.results, { headers: CORS });
}

// ─── Saves ──────────────────────────────────────────────────────────────────

export async function handleSaveVideo(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string };

	if (!body.user_id) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	try {
		await env.DB.prepare(`INSERT INTO saves (user_id, video_id) VALUES (?, ?)`).bind(body.user_id, videoId).run();
	} catch {
		// Already saved — ignore
	}

	return Response.json({ message: 'saved' }, { headers: CORS });
}

export async function handleUnsaveVideo(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string };

	if (!body.user_id) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	await env.DB.prepare(`DELETE FROM saves WHERE user_id = ? AND video_id = ?`).bind(body.user_id, videoId).run();

	return Response.json({ message: 'unsaved' }, { headers: CORS });
}

export async function handleGetUserSavedVideos(userId: string, env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT videos.id, videos.video_url, videos.uploaded_at, users.id as user_id, users.username
     FROM saves
     JOIN videos ON saves.video_id = videos.id
     JOIN users ON videos.user_id = users.id
     WHERE saves.user_id = ?
     ORDER BY saves.created_at DESC`,
	)
		.bind(userId)
		.all();

	return Response.json(result.results, { headers: CORS });
}

// ─── Views ──────────────────────────────────────────────────────────────────

export async function handleRecordView(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string };

	if (!body.user_id) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	try {
		await env.DB.prepare(`INSERT INTO views (user_id, video_id) VALUES (?, ?)`).bind(body.user_id, videoId).run();
		return Response.json({ message: 'view recorded' }, { headers: CORS });
	} catch {
		// Already viewed by this user before — don't count again
		return Response.json({ message: 'already viewed' }, { headers: CORS });
	}
}

// ─── Comments ───────────────────────────────────────────────────────────────

export async function handleAddComment(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string; text: string };

	if (!body.user_id || !body.text) {
		return Response.json({ error: 'user_id and text are required' }, { status: 400, headers: CORS });
	}

	if (body.text.trim().length === 0) {
		return Response.json({ error: 'Comment cannot be empty' }, { status: 400, headers: CORS });
	}

	const id = crypto.randomUUID();

	await env.DB.prepare(`INSERT INTO comments (id, user_id, video_id, text) VALUES (?, ?, ?, ?)`)
		.bind(id, body.user_id, videoId, body.text.trim())
		.run();

	return Response.json({ id, message: 'comment added' }, { headers: CORS });
}

export async function handleGetComments(videoId: string, env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT comments.id, comments.text, comments.created_at, users.id as user_id, users.username, users.profile_image
     FROM comments
     JOIN users ON comments.user_id = users.id
     WHERE comments.video_id = ?
     ORDER BY comments.created_at DESC`,
	)
		.bind(videoId)
		.all();

	return Response.json(result.results, { headers: CORS });
}
