import { Env, CORS } from '../types';

// Main feed — all approved videos
export async function handleGetApprovedVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT videos.id, videos.video_url, videos.uploaded_at, users.id as user_id, users.username
     FROM videos
     JOIN users ON videos.user_id = users.id
     WHERE videos.status = 'approved'
     ORDER BY videos.uploaded_at DESC`,
	).all();

	return Response.json(result.results, { headers: CORS });
}

// Reviewer — all pending videos
export async function handleGetPendingVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT videos.id, videos.video_url, videos.uploaded_at, users.id as user_id, users.username
     FROM videos
     JOIN users ON videos.user_id = users.id
     WHERE videos.status = 'pending'
     ORDER BY videos.uploaded_at ASC`,
	).all();

	return Response.json(result.results, { headers: CORS });
}

// Upload — requires user_id in the form
export async function handleUploadVideo(request: Request, env: Env): Promise<Response> {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return Response.json({ error: 'Expected multipart form data' }, { status: 400, headers: CORS });
	}

	const file = formData.get('video') as File | null;
	const userId = formData.get('user_id') as string | null;

	if (!file) {
		return Response.json({ error: 'No video file provided' }, { status: 400, headers: CORS });
	}

	if (!userId) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	// Make sure the user exists
	const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();

	if (!user) {
		return Response.json({ error: 'User not found' }, { status: 404, headers: CORS });
	}

	if (!file.type.startsWith('video/')) {
		return Response.json({ error: 'File must be a video' }, { status: 400, headers: CORS });
	}

	if (file.size > 100 * 1024 * 1024) {
		return Response.json({ error: 'File too large (max 100MB)' }, { status: 400, headers: CORS });
	}

	const ext = file.name.split('.').pop() ?? 'mp4';
	const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

	await env.VIDEOS_BUCKET.put(key, file.stream(), {
		httpMetadata: { contentType: file.type },
	});

	const videoUrl = `https://my-worker.mohammad-3db.workers.dev/api/videos/file/${key}`;
	const id = crypto.randomUUID();
	const uploadedAt = new Date().toISOString();

	await env.DB.prepare(`INSERT INTO videos (id, user_id, video_url, status, uploaded_at) VALUES (?, ?, ?, 'pending', ?)`)
		.bind(id, userId, videoUrl, uploadedAt)
		.run();

	return Response.json({ id, video_url: videoUrl, uploaded_at: uploadedAt }, { headers: CORS });
}

// Approve
export async function handleApproveVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(`SELECT * FROM videos WHERE id = ? AND status = 'pending'`)
		.bind(id)
		.first<{ id: string; video_url: string }>();

	if (!video) {
		return Response.json({ error: 'Video not found' }, { status: 404, headers: CORS });
	}

	await env.DB.prepare(`UPDATE videos SET status = 'approved' WHERE id = ?`).bind(id).run();

	return Response.json({ message: 'approved' }, { headers: CORS });
}

// Reject — delete from D1 and R2
export async function handleRejectVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(`SELECT * FROM videos WHERE id = ? AND status = 'pending'`)
		.bind(id)
		.first<{ id: string; video_url: string }>();

	if (video) {
		const key = video.video_url.split('/').pop();
		if (key) await env.VIDEOS_BUCKET.delete(key);
	}

	await env.DB.prepare(`DELETE FROM videos WHERE id = ?`).bind(id).run();

	return Response.json({ message: 'rejected' }, { headers: CORS });
}

export async function handleServeVideo(key: string, request: Request, env: Env): Promise<Response> {
	const object = await env.VIDEOS_BUCKET.get(key);

	if (!object) {
		return new Response('Video not found', { status: 404, headers: CORS });
	}

	const headers = new Headers();
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
	headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
	headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
	headers.set('Content-Type', object.httpMetadata?.contentType ?? 'video/mp4');
	headers.set('Accept-Ranges', 'bytes');
	headers.set('Cache-Control', 'public, max-age=31536000');

	// Handle range requests (needed for video seeking)
	const rangeHeader = request.headers.get('Range');
	if (rangeHeader) {
		const size = object.size;
		const [start, end] = rangeHeader
			.replace('bytes=', '')
			.split('-')
			.map((v) => (v ? parseInt(v) : undefined));

		const startByte = start ?? 0;
		const endByte = end ?? size - 1;
		const chunkSize = endByte - startByte + 1;

		headers.set('Content-Range', `bytes ${startByte}-${endByte}/${size}`);
		headers.set('Content-Length', chunkSize.toString());

		return new Response(object.body, { status: 206, headers });
	}

	headers.set('Content-Length', object.size.toString());
	return new Response(object.body, { status: 200, headers });
}
