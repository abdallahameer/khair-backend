import { Env, CORS } from '../types';

export const VIDEO_CATEGORIES = [
	'Technology & Programming',
	'Business & Entrepreneurship',
	'Finance & Investing',
	'Design & Creativity',
	'Education & Personal Development',
	'Science, Culture & Knowledge',
	'Religious',
] as const;

export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

// Main feed — all approved videos
export async function handleGetApprovedVideos(env: Env, userId?: string, cursor?: string, limit: number = 10): Promise<Response> {
	const safeLimit = Math.min(Math.max(limit, 1), 50); // clamp between 1-50

	const cursorClause = cursor ? `AND videos.uploaded_at < ?` : '';

	const query = userId
		? `SELECT 
         videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         EXISTS(SELECT 1 FROM likes WHERE likes.video_id = videos.id AND likes.user_id = ?) as is_liked,
         EXISTS(SELECT 1 FROM saves WHERE saves.video_id = videos.id AND saves.user_id = ?) as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.status = 'approved' ${cursorClause}
       ORDER BY videos.uploaded_at DESC
       LIMIT ?`
		: `SELECT 
         videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         0 as is_liked, 0 as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.status = 'approved' ${cursorClause}
       ORDER BY videos.uploaded_at DESC
       LIMIT ?`;

	let stmt;
	if (userId && cursor) {
		stmt = env.DB.prepare(query).bind(userId, userId, cursor, safeLimit + 1);
	} else if (userId) {
		stmt = env.DB.prepare(query).bind(userId, userId, safeLimit + 1);
	} else if (cursor) {
		stmt = env.DB.prepare(query).bind(cursor, safeLimit + 1);
	} else {
		stmt = env.DB.prepare(query).bind(safeLimit + 1);
	}

	const result = await stmt.all();
	const rows = result.results as any[];

	// We fetched one extra row to know if there's a next page
	const hasMore = rows.length > safeLimit;
	const videos = hasMore ? rows.slice(0, safeLimit) : rows;
	const nextCursor = hasMore ? videos[videos.length - 1].uploaded_at : null;

	return Response.json({ videos, nextCursor }, { headers: CORS });
}

export async function handleGetPendingVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category, users.id as user_id, users.username
     FROM videos
     JOIN users ON videos.user_id = users.id
     WHERE videos.status = 'pending'
     ORDER BY videos.uploaded_at ASC`,
	).all();

	return Response.json(result.results, { headers: CORS });
}

// Upload — requires user_id, category. Instant publish, no review queue.
export async function handleUploadVideo(request: Request, env: Env): Promise<Response> {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return Response.json({ error: 'Expected multipart form data' }, { status: 400, headers: CORS });
	}

	const file = formData.get('video') as File | null;
	const userId = formData.get('user_id') as string | null;
	const description = (formData.get('description') as string | null) ?? '';
	const category = formData.get('category') as string | null;

	if (!file) {
		return Response.json({ error: 'No video file provided' }, { status: 400, headers: CORS });
	}

	if (!userId) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	if (!category || !VIDEO_CATEGORIES.includes(category as VideoCategory)) {
		return Response.json({ error: 'A valid category is required' }, { status: 400, headers: CORS });
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

	if (description.length > 2000) {
		return Response.json({ error: 'Description is too long (max 2000 characters)' }, { status: 400, headers: CORS });
	}

	const ext = file.name.split('.').pop() ?? 'mp4';
	const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

	await env.VIDEOS_BUCKET.put(key, file.stream(), {
		httpMetadata: { contentType: file.type },
	});

	const videoUrl = `${env.R2_PUBLIC_URL}/${key}`;
	const id = crypto.randomUUID();
	const uploadedAt = new Date().toISOString();

	// Instant publish — status goes straight to 'approved', no review step
	await env.DB.prepare(
		`INSERT INTO videos (id, user_id, video_url, status, uploaded_at, description, category)
		 VALUES (?, ?, ?, 'approved', ?, ?, ?)`,
	)
		.bind(id, userId, videoUrl, uploadedAt, description.trim(), category)
		.run();

	return Response.json({ id, video_url: videoUrl, uploaded_at: uploadedAt, description: description.trim(), category }, { headers: CORS });
}

// Approve — kept for future report-review flow, unused by upload now
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

// Reject — delete from D1 and R2. Kept for future report-review flow.
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
         videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         EXISTS(SELECT 1 FROM likes WHERE likes.video_id = videos.id AND likes.user_id = ?) as is_liked,
         EXISTS(SELECT 1 FROM saves WHERE saves.video_id = videos.id AND saves.user_id = ?) as is_saved
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.id = ? AND videos.status = 'approved'`
		: `SELECT 
         videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category,
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
