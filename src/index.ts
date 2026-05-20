import { Env, CORS } from './types';
import { handleReviewerLogin, handleUserLogin, handleUserRegister, handleGetUserProfile } from './handlers/auth';
import {
	handleGetApprovedVideos,
	handleGetPendingVideos,
	handleUploadVideo,
	handleApproveVideo,
	handleRejectVideo,
} from './handlers/videos';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS });
		}

		// ─── Videos ───────────────────────────────────────────────
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

		// ─── Auth ─────────────────────────────────────────────────
		if (url.pathname === '/api/auth/reviewer-login' && request.method === 'POST') {
			return handleReviewerLogin(request, env);
		}

		if (url.pathname === '/api/users/register' && request.method === 'POST') {
			return handleUserRegister(request, env);
		}

		if (url.pathname === '/api/users/login' && request.method === 'POST') {
			return handleUserLogin(request, env);
		}

		// ─── User profiles ─────────────────────────────────────────
		if (url.pathname.startsWith('/api/users/') && request.method === 'GET') {
			const userId = url.pathname.split('/api/users/')[1];
			return handleGetUserProfile(userId, env);
		}

		if (url.pathname === '/healthz') {
			return new Response('ok', { headers: CORS });
		}

		return new Response('Not found', { status: 404, headers: CORS });
	},
};
