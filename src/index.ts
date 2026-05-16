interface Env {
	DB: D1Database;

	PENDING_BUCKET: R2Bucket;
	APPROVED_BUCKET: R2Bucket;

	ADMIN_TOKEN: string;

	PENDING_PUBLIC_URL: string;
	APPROVED_PUBLIC_URL: string;
}

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// CREATE JSON RESPONSE
function json(data: any, status = 200): Response {
	return Response.json(data, {
		status,
		headers: CORS,
	});
}

// AUTH CHECK
function isAuthorized(request: Request, env: Env): boolean {
	const authHeader = request.headers.get('Authorization');

	if (!authHeader) {
		return false;
	}

	const token = authHeader.replace('Bearer ', '');

	return token === env.ADMIN_TOKEN;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// OPTIONS
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: CORS,
			});
		}

		// HEALTH
		if (url.pathname === '/healthz') {
			return new Response('ok', {
				headers: CORS,
			});
		}

		// LOGIN
		if (url.pathname === '/api/auth/login' && request.method === 'POST') {
			return handleLogin(request, env);
		}

		// GET APPROVED VIDEOS
		if (url.pathname === '/api/videos/approved' && request.method === 'GET') {
			return handleGetApprovedVideos(env);
		}

		// GET PENDING VIDEOS
		if (url.pathname === '/api/videos/pending' && request.method === 'GET') {
			if (!isAuthorized(request, env)) {
				return json({ error: 'Unauthorized' }, 401);
			}

			return handleGetPendingVideos(env);
		}

		// UPLOAD VIDEO
		if (url.pathname === '/api/videos/upload' && request.method === 'POST') {
			return handleUploadVideo(request, env);
		}

		// APPROVE VIDEO
		if (url.pathname.startsWith('/api/videos/approve/') && request.method === 'POST') {
			if (!isAuthorized(request, env)) {
				return json({ error: 'Unauthorized' }, 401);
			}

			const id = url.pathname.split('/api/videos/approve/')[1];

			return handleApproveVideo(id, env);
		}

		// REJECT VIDEO
		if (url.pathname.startsWith('/api/videos/reject/') && request.method === 'DELETE') {
			if (!isAuthorized(request, env)) {
				return json({ error: 'Unauthorized' }, 401);
			}

			const id = url.pathname.split('/api/videos/reject/')[1];

			return handleRejectVideo(id, env);
		}

		return json({ error: 'Not Found' }, 404);
	},
};

// GET APPROVED VIDEOS
async function handleGetApprovedVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`
		SELECT id, video_url, approved_at
		FROM approved_videos
		ORDER BY approved_at DESC
	`,
	).all();

	const videos = result.results.map((video: any) => ({
		...video,

		video_url: `${env.APPROVED_PUBLIC_URL}/${video.video_url}`,
	}));

	return json(videos);
}

// GET PENDING VIDEOS
async function handleGetPendingVideos(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`
		SELECT id, video_url, uploaded_at
		FROM pending_videos
		ORDER BY uploaded_at DESC
	`,
	).all();

	const videos = result.results.map((video: any) => ({
		...video,

		video_url: `${env.PENDING_PUBLIC_URL}/${video.video_url}`,
	}));

	return json(videos);
}

// UPLOAD VIDEO
async function handleUploadVideo(request: Request, env: Env): Promise<Response> {
	try {
		const formData = await request.formData();

		const file = formData.get('video') as File;

		if (!file) {
			return json(
				{
					error: 'No video uploaded',
				},
				400,
			);
		}

		// MAX 100MB
		const MAX_SIZE = 100 * 1024 * 1024;

		if (file.size > MAX_SIZE) {
			return json(
				{
					error: 'Video too large',
				},
				400,
			);
		}

		// ALLOWED TYPES
		const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

		if (!allowedTypes.includes(file.type)) {
			return json(
				{
					error: 'Invalid video format',
				},
				400,
			);
		}

		const id = crypto.randomUUID();

		const extension = file.name.split('.').pop();

		const key = `${id}.${extension}`;

		// UPLOAD TO PENDING R2
		await env.PENDING_BUCKET.put(key, file.stream(), {
			httpMetadata: {
				contentType: file.type,
			},
		});

		const uploadedAt = new Date().toISOString();

		// SAVE TO DATABASE
		await env.DB.prepare(
			`
			INSERT INTO pending_videos (
				id,
				video_url,
				uploaded_at
			)
			VALUES (?, ?, ?)
		`,
		)
			.bind(id, key, uploadedAt)
			.run();

		return json({
			success: true,
			id,
			video_url: key,
			uploaded_at: uploadedAt,
		});
	} catch (error) {
		return json(
			{
				error: 'Upload failed',
			},
			500,
		);
	}
}

// APPROVE VIDEO
async function handleApproveVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(
		`
		SELECT *
		FROM pending_videos
		WHERE id = ?
	`,
	)
		.bind(id)
		.first();

	if (!video) {
		return json(
			{
				error: 'Video not found',
			},
			404,
		);
	}

	const key = video.video_url as string;

	// GET FILE FROM PENDING
	const object = await env.PENDING_BUCKET.get(key);

	if (!object) {
		return json(
			{
				error: 'Video file missing',
			},
			404,
		);
	}

	// COPY TO APPROVED
	await env.APPROVED_BUCKET.put(key, object.body);

	// DELETE FROM PENDING BUCKET
	await env.PENDING_BUCKET.delete(key);

	const approvedAt = new Date().toISOString();

	// INSERT APPROVED
	await env.DB.prepare(
		`
		INSERT INTO approved_videos (
			id,
			video_url,
			approved_at
		)
		VALUES (?, ?, ?)
	`,
	)
		.bind(video.id, key, approvedAt)
		.run();

	// DELETE PENDING ROW
	await env.DB.prepare(
		`
		DELETE FROM pending_videos
		WHERE id = ?
	`,
	)
		.bind(id)
		.run();

	return json({
		success: true,
		message: 'Video approved',
	});
}

// REJECT VIDEO
async function handleRejectVideo(id: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(
		`
		SELECT *
		FROM pending_videos
		WHERE id = ?
	`,
	)
		.bind(id)
		.first();

	if (!video) {
		return json(
			{
				error: 'Video not found',
			},
			404,
		);
	}

	const key = video.video_url as string;

	// DELETE FROM R2
	await env.PENDING_BUCKET.delete(key);

	// DELETE DB ROW
	await env.DB.prepare(
		`
		DELETE FROM pending_videos
		WHERE id = ?
	`,
	)
		.bind(id)
		.run();

	return json({
		success: true,
		message: 'Video rejected',
	});
}

// LOGIN
async function handleLogin(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as {
			username: string;
			password: string;
		};

		if (!body.username || !body.password) {
			return json(
				{
					error: 'Username and password required',
				},
				400,
			);
		}

		const reviewer = await env.DB.prepare(
			`
			SELECT id, username
			FROM reviewers
			WHERE username = ?
			AND password = ?
		`,
		)
			.bind(body.username.toLowerCase(), body.password)
			.first();

		if (!reviewer) {
			return json(
				{
					error: 'Invalid username or password',
				},
				401,
			);
		}

		return json({
			success: true,
			token: env.ADMIN_TOKEN,
			reviewer,
		});
	} catch (error) {
		return json(
			{
				error: 'Login failed',
			},
			500,
		);
	}
}
