import { hashPassword, verifyPassword } from '../helpers/password';
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
	const body = (await request.json()) as { username: string; password: string; email: string };

	if (!body.username || !body.password || !body.email) {
		return Response.json({ error: 'Username, email, and password are required' }, { status: 400, headers: CORS });
	}

	if (body.username.length < 3) {
		return Response.json({ error: 'Username must be at least 3 characters' }, { status: 400, headers: CORS });
	}

	if (body.password.length < 6) {
		return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400, headers: CORS });
	}

	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailPattern.test(body.email)) {
		return Response.json({ error: 'Please enter a valid email address' }, { status: 400, headers: CORS });
	}

	const existingUsername = await env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(body.username.toLowerCase()).first();

	if (existingUsername) {
		return Response.json({ error: 'Username already taken' }, { status: 409, headers: CORS });
	}

	const existingEmail = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(body.email.toLowerCase()).first();

	if (existingEmail) {
		return Response.json({ error: 'Email already in use' }, { status: 409, headers: CORS });
	}

	const id = crypto.randomUUID();
	const { hash, salt } = await hashPassword(body.password);

	await env.DB.prepare(`INSERT INTO users (id, username, email, password, password_salt) VALUES (?, ?, ?, ?, ?)`)
		.bind(id, body.username.toLowerCase(), body.email.toLowerCase(), hash, salt)
		.run();

	return Response.json({ id, username: body.username.toLowerCase() }, { headers: CORS });
}

// User login
export async function handleUserLogin(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { username: string; password: string };

	const user = await env.DB.prepare(`SELECT id, username, password, password_salt, email FROM users WHERE username = ?`)
		.bind(body.username.toLowerCase())
		.first<{ id: string; username: string; password: string; password_salt: string | null; email: string | null }>();

	if (!user) {
		return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
	}

	if (!user.password_salt) {
		// Legacy plain-text password — verify directly, then migrate to a hash seamlessly
		if (user.password !== body.password) {
			return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
		}

		const { hash, salt } = await hashPassword(body.password);
		await env.DB.prepare(`UPDATE users SET password = ?, password_salt = ? WHERE id = ?`).bind(hash, salt, user.id).run();
	} else {
		// Already hashed — verify normally
		const valid = await verifyPassword(body.password, user.password, user.password_salt);
		if (!valid) {
			return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
		}
	}

	return Response.json({ id: user.id, username: user.username, needs_email: !user.email }, { headers: CORS });
}

// Just the user's basic info — no videos
export async function handleGetUserProfile(userId: string, env: Env): Promise<Response> {
	const user = await env.DB.prepare(`SELECT id, username, created_at, profile_image FROM users WHERE id = ?`).bind(userId).first();

	if (!user) {
		return Response.json({ error: 'User not found' }, { status: 404, headers: CORS });
	}

	return Response.json({ user }, { headers: CORS });
}

// Paginated list of this user's own uploaded (approved) videos
export async function handleGetUserVideos(
	userId: string,
	env: Env,
	viewerId?: string,
	cursor?: string,
	limit: number = 10,
): Promise<Response> {
	const safeLimit = Math.min(Math.max(limit, 1), 50);
	const cursorClause = cursor ? `AND uploaded_at < ?` : '';

	const query = viewerId
		? `SELECT 
        id, video_url, uploaded_at,
        likes_count, comments_count, views_count, saves_count,
        EXISTS(SELECT 1 FROM likes WHERE likes.video_id = videos.id AND likes.user_id = ?) as is_liked,
        EXISTS(SELECT 1 FROM saves WHERE saves.video_id = videos.id AND saves.user_id = ?) as is_saved
       FROM videos 
       WHERE user_id = ? AND status = 'approved' ${cursorClause}
       ORDER BY uploaded_at DESC
       LIMIT ?`
		: `SELECT 
        id, video_url, uploaded_at,
        likes_count, comments_count, views_count, saves_count,
        0 as is_liked, 0 as is_saved
       FROM videos 
       WHERE user_id = ? AND status = 'approved' ${cursorClause}
       ORDER BY uploaded_at DESC
       LIMIT ?`;

	let stmt;
	if (viewerId && cursor) {
		stmt = env.DB.prepare(query).bind(viewerId, viewerId, userId, cursor, safeLimit + 1);
	} else if (viewerId) {
		stmt = env.DB.prepare(query).bind(viewerId, viewerId, userId, safeLimit + 1);
	} else if (cursor) {
		stmt = env.DB.prepare(query).bind(userId, cursor, safeLimit + 1);
	} else {
		stmt = env.DB.prepare(query).bind(userId, safeLimit + 1);
	}

	const result = await stmt.all();
	const rows = result.results as any[];

	const hasMore = rows.length > safeLimit;
	const videos = hasMore ? rows.slice(0, safeLimit) : rows;
	const nextCursor = hasMore ? videos[videos.length - 1].uploaded_at : null;

	return Response.json({ videos, nextCursor }, { headers: CORS });
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

export async function handleAddEmail(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string; email: string };

	if (!body.user_id || !body.email) {
		return Response.json({ error: 'user_id and email are required' }, { status: 400, headers: CORS });
	}

	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailPattern.test(body.email)) {
		return Response.json({ error: 'Please enter a valid email address' }, { status: 400, headers: CORS });
	}

	const existingEmail = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(body.email.toLowerCase()).first();

	if (existingEmail) {
		return Response.json({ error: 'Email already in use' }, { status: 409, headers: CORS });
	}

	await env.DB.prepare(`UPDATE users SET email = ? WHERE id = ?`).bind(body.email.toLowerCase(), body.user_id).run();

	return Response.json({ message: 'email added' }, { headers: CORS });
}
