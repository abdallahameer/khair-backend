import { Env, CORS } from '../types';

// Main feed — all approved videos
export async function handleGetApprovedVideos(env: Env, userId?: string): Promise<Response> {
	const query = userId
		? `SELECT 
         videos.id, videos.video_url, videos.uploaded_at, 
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         EXISTS(SELECT 1 FROM likes WHERE likes.video_id = videos.id AND likes.user_id = ?) as is_liked,
         EXISTS(SELECT 1 FROM saves WHERE saves.video_id = videos.id AND saves.user_id = ?) as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.status = 'approved'
       ORDER BY videos.uploaded_at DESC`
		: `SELECT 
         videos.id, videos.video_url, videos.uploaded_at,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         0 as is_liked, 0 as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.status = 'approved'
       ORDER BY videos.uploaded_at DESC`;

	const stmt = userId ? env.DB.prepare(query).bind(userId, userId) : env.DB.prepare(query);
	const result = await stmt.all();

	return Response.json(result.results, { headers: CORS });
}

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

	const videoUrl = `${env.R2_PUBLIC_URL}/${key}`;
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

export async function handleGetVideoById(videoId: string, env: Env, viewerId?: string): Promise<Response> {
	const query = viewerId
		? `SELECT 
         videos.id, videos.video_url, videos.uploaded_at,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         EXISTS(SELECT 1 FROM likes WHERE likes.video_id = videos.id AND likes.user_id = ?) as is_liked,
         EXISTS(SELECT 1 FROM saves WHERE saves.video_id = videos.id AND saves.user_id = ?) as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.id = ? AND videos.status = 'approved'`
		: `SELECT 
         videos.id, videos.video_url, videos.uploaded_at,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         0 as is_liked, 0 as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.id = ? AND videos.status = 'approved'`;

	const stmt = viewerId ? env.DB.prepare(query).bind(viewerId, viewerId, videoId) : env.DB.prepare(query).bind(videoId);

	const video = await stmt.first();

	if (!video) {
		return Response.json({ error: 'Video not found' }, { status: 404, headers: CORS });
	}

	return Response.json(video, { headers: CORS });
}
