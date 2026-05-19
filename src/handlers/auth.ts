import { Env, CORS } from '../types';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { username: string; password: string };

	const reviewer = await env.DB.prepare(`SELECT id, username FROM reviewers WHERE username = ? AND password = ?`)
		.bind(body.username.toLowerCase(), body.password)
		.first();

	if (!reviewer) {
		return Response.json({ error: 'Invalid username or password' }, { status: 401, headers: CORS });
	}

	return Response.json({ id: reviewer.id, username: reviewer.username }, { headers: CORS });
}
