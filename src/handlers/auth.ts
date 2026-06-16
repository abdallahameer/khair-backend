import { Env, CORS } from '../types';

// Reviewer login (unchanged)
export async function handleReviewerLogin(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { username: string; password: string };

	const reviewer = await env.DB.prepare(`SELECT id, username FROM reviewers WHERE username = ? AND password = ?`)
		.bind(body.username.toLowerCase(), body.password)
		.first();

	if (!reviewer) {
		return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
	}

	return Response.json({ id: reviewer.id, username: reviewer.username }, { headers: CORS });
}

// User register
export async function handleUserRegister(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { username: string; password: string };

	if (!body.username || !body.password) {
		return Response.json({ error: 'Username and password are required' }, { status: 400, headers: CORS });
	}

	if (body.username.length < 3) {
		return Response.json({ error: 'Username must be at least 3 characters' }, { status: 400, headers: CORS });
	}

	if (body.password.length < 6) {
		return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400, headers: CORS });
	}

	// Check if username already taken
	const existing = await env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(body.username.toLowerCase()).first();

	if (existing) {
		return Response.json({ error: 'Username already taken' }, { status: 409, headers: CORS });
	}

	const id = crypto.randomUUID();

	await env.DB.prepare(`INSERT INTO users (id, username, password) VALUES (?, ?, ?)`)
		.bind(id, body.username.toLowerCase(), body.password)
		.run();

	return Response.json({ id, username: body.username.toLowerCase() }, { headers: CORS });
}

// User login
export async function handleUserLogin(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { username: string; password: string };

	const user = await env.DB.prepare(`SELECT id, username FROM users WHERE username = ? AND password = ?`)
		.bind(body.username.toLowerCase(), body.password)
		.first();

	if (!user) {
		return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
	}

	return Response.json({ id: user.id, username: user.username }, { headers: CORS });
}

// Get user profile + their approved videos
export async function handleGetUserProfile(userId: string, env: Env): Promise<Response> {
	const user = await env.DB.prepare(`SELECT id, username, created_at, profile_image FROM users WHERE id = ?`).bind(userId).first();

	if (!user) {
		return Response.json({ error: 'User not found' }, { status: 404, headers: CORS });
	}

	const videos = await env.DB.prepare(
		`SELECT id, video_url, uploaded_at FROM videos WHERE user_id = ? AND status = 'approved' ORDER BY uploaded_at DESC`,
	)
		.bind(userId)
		.all();

	return Response.json({ user, videos: videos.results }, { headers: CORS });
}

// Upload profile image
export async function handleUploadProfileImage(request: Request, env: Env): Promise<Response> {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return Response.json({ error: 'Expected multipart form data' }, { status: 400, headers: CORS });
	}

	const file = formData.get('image') as File | null;
	const userId = formData.get('user_id') as string | null;

	if (!file) {
		return Response.json({ error: 'No image file provided' }, { status: 400, headers: CORS });
	}

	if (!userId) {
		return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
	}

	if (!file.type.startsWith('image/')) {
		return Response.json({ error: 'File must be an image' }, { status: 400, headers: CORS });
	}

	if (file.size > 5 * 1024 * 1024) {
		return Response.json({ error: 'Image too large (max 5MB)' }, { status: 400, headers: CORS });
	}

	const ext = file.name.split('.').pop() ?? 'jpg';
	const key = `${userId}-${Date.now()}.${ext}`;

	await env.IMAGES_BUCKET.put(key, file.stream(), {
		httpMetadata: { contentType: file.type },
	});

	const imageUrl = `${env.R2_PUBLIC_URL_IMAGES}/${key}`;

	await env.DB.prepare(`UPDATE users SET profile_image = ? WHERE id = ?`).bind(imageUrl, userId).run();

	return Response.json({ profile_image: imageUrl }, { headers: CORS });
}
