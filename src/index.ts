const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS });
		}

		// ─── Videos ───────────────────────────────────────────────────
		if (url.pathname === '/api/videos/approved' && request.method === 'GET') {
			return handleGetApprovedVideos(env);
		}

		if (url.pathname === '/api/videos/pending' && request.method === 'GET') {
			return handleGetPendingVideos(env);
		}

		if (url.pathname === '/api/videos/upload' && request.method === 'POST') {
			return handleUploadVideo(request, env);
		}

		if (url.pathname.startsWith('/api/videos/approve/') && request.method === 'POST') {
			const id = url.pathname.split('/api/videos/approve/')[1];
			return handleApproveVideo(id, env);
		}

		if (url.pathname.startsWith('/api/videos/reject/') && request.method === 'DELETE') {
			const id = url.pathname.split('/api/videos/reject/')[1];
			return handleRejectVideo(id, env);
		}

		// ─── Auth ─────────────────────────────────────────────────────
		if (url.pathname === '/api/auth/login' && request.method === 'POST') {
			return handleLogin(request, env);
		}

		if (url.pathname === '/healthz') {
			return new Response('ok', { headers: CORS });
		}

		return new Response('Not found', { status: 404, headers: CORS });
	},
};

// ─── Video Handlers ────────────────────────────────────────────────────────────

async function handleGetApprovedVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(`SELECT id, video_url, approved_at FROM approved_videos ORDER BY approved_at ASC`).all();

	return Response.json(result.results, { headers: CORS });
}

async function handleGetPendingVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(`SELECT id, video_url, uploaded_at FROM pending_videos ORDER BY uploaded_at ASC`).all();

	return Response.json(result.results, { headers: CORS });
}

async function handleUploadVideo(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { video_url: string };

	if (!body.video_url) {
		return Response.json({ error: 'video_url is required' }, { status: 400, headers: CORS });
	}

	const id = crypto.randomUUID();
	const uploadedAt = new Date().toISOString();

	await env.DB.prepare(`INSERT INTO pending_videos (id, video_url, uploaded_at) VALUES (?, ?, ?)`)
		.bind(id, body.video_url, uploadedAt)
		.run();

	return Response.json({ id, video_url: body.video_url, uploaded_at: uploadedAt }, { headers: CORS });
}

async function handleApproveVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(`SELECT * FROM pending_videos WHERE id = ?`).bind(id).first();

	if (!video) {
		return Response.json({ error: 'Video not found' }, { status: 404, headers: CORS });
	}

	const approvedAt = new Date().toISOString();

	await env.DB.prepare(`INSERT INTO approved_videos (id, video_url, approved_at) VALUES (?, ?, ?)`)
		.bind(video.id, video.video_url, approvedAt)
		.run();

	await env.DB.prepare(`DELETE FROM pending_videos WHERE id = ?`).bind(id).run();

	return Response.json({ message: 'approved' }, { headers: CORS });
}

async function handleRejectVideo(id: string, env: Env): Promise<Response> {
	await env.DB.prepare(`DELETE FROM pending_videos WHERE id = ?`).bind(id).run();

	return Response.json({ message: 'rejected' }, { headers: CORS });
}

// ─── Auth Handler ──────────────────────────────────────────────────────────────

async function handleLogin(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { username: string; password: string };

	const reviewer = await env.DB.prepare(`SELECT id, username FROM reviewers WHERE username = ? AND password = ?`)
		.bind(body.username.toLowerCase(), body.password)
		.first();

	if (!reviewer) {
		return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
	}

	return Response.json({ id: reviewer.id, username: reviewer.username }, { headers: CORS });
}
