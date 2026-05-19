import { Env, CORS } from './types';
import { handleLogin } from './handlers/auth';
import {
	handleGetApprovedVideos,
	handleGetPendingVideos,
	handleUploadVideo,
	handleApproveVideo,
	handleRejectVideo,
} from './handlers/videos';

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

		if (url.pathname === '/api/auth/login' && request.method === 'POST') {
			return handleLogin(request, env);
		}

			return handleRejectVideo(id, env);
		}

		return json({ error: 'Not Found' }, 404);
	},
};
