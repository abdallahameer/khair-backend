import { Env, CORS } from '../types';

export async function handleGetApprovedVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(`SELECT id, video_url, approved_at FROM approved_videos ORDER BY approved_at ASC`).all();

	return Response.json(result.results, { headers: CORS });
}

export async function handleGetPendingVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(`SELECT id, video_url, uploaded_at FROM pending_videos ORDER BY uploaded_at ASC`).all();

	return Response.json(result.results, { headers: CORS });
}

export async function handleUploadVideo(request: Request, env: Env): Promise<Response> {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return Response.json({ error: 'Expected multipart form data' }, { status: 400, headers: CORS });
	}

	const file = formData.get('video') as File | null;

	if (!file) {
		return Response.json({ error: 'No video file provided' }, { status: 400, headers: CORS });
	}

	if (!file.type.startsWith('video/')) {
		return Response.json({ error: 'File must be a video' }, { status: 400, headers: CORS });
	}

	if (file.size > 100 * 1024 * 1024) {
		return Response.json({ error: 'File too large (max 100MB)' }, { status: 400, headers: CORS });
	}

	const ext = file.name.split('.').pop() ?? 'mp4';
	const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

	await env.PENDING_BUCKET.put(key, file.stream(), {
		httpMetadata: { contentType: file.type },
	});

	const videoUrl = `${env.PENDING_PUBLIC_URL}/${key}`;
	const id = crypto.randomUUID();
	const uploadedAt = new Date().toISOString();

	await env.DB.prepare(`INSERT INTO pending_videos (id, video_url, uploaded_at) VALUES (?, ?, ?)`).bind(id, videoUrl, uploadedAt).run();

	return Response.json({ id, video_url: videoUrl, uploaded_at: uploadedAt }, { headers: CORS });
}

export async function handleApproveVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(`SELECT * FROM pending_videos WHERE id = ?`).bind(id).first<{ id: string; video_url: string }>();

	if (!video) {
		return Response.json({ error: 'Video not found' }, { status: 404, headers: CORS });
	}

	const key = video.video_url.split('/').pop()!;
	const fileObject = await env.PENDING_BUCKET.get(key);

	if (!fileObject) {
		return Response.json({ error: 'File not found in storage' }, { status: 404, headers: CORS });
	}

	await env.APPROVED_BUCKET.put(key, fileObject.body, {
		httpMetadata: fileObject.httpMetadata,
	});

	await env.PENDING_BUCKET.delete(key);

	const approvedUrl = `${env.APPROVED_PUBLIC_URL}/${key}`;
	const approvedAt = new Date().toISOString();

	await env.DB.prepare(`INSERT INTO approved_videos (id, video_url, approved_at) VALUES (?, ?, ?)`)
		.bind(video.id, approvedUrl, approvedAt)
		.run();

	await env.DB.prepare(`DELETE FROM pending_videos WHERE id = ?`).bind(id).run();

	return Response.json({ message: 'approved' }, { headers: CORS });
}

export async function handleRejectVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(`SELECT * FROM pending_videos WHERE id = ?`).bind(id).first<{ id: string; video_url: string }>();

	if (video) {
		const key = video.video_url.split('/').pop();
		if (key) await env.PENDING_BUCKET.delete(key);
	}

	await env.DB.prepare(`DELETE FROM pending_videos WHERE id = ?`).bind(id).run();

	return Response.json({ message: 'rejected' }, { headers: CORS });
}
