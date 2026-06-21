import { Env, CORS } from './types';
import { handleReviewerLogin, handleUserLogin, handleUserRegister, handleGetUserProfile, handleUploadProfileImage } from './handlers/auth';
import {
	handleGetApprovedVideos,
	handleGetPendingVideos,
	handleUploadVideo,
	handleApproveVideo,
	handleRejectVideo,
} from './handlers/videos';
import {
	handleLikeVideo,
	handleUnlikeVideo,
	handleGetVideoLikes,
	handleGetUserLikedVideos,
	handleSaveVideo,
	handleUnsaveVideo,
	handleGetUserSavedVideos,
	handleRecordView,
	handleAddComment,
	handleGetComments,
} from './handlers/engagement';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS });
		}

		// ─── Videos ───────────────────────────────────────────────
		if (url.pathname === '/api/videos/approved' && request.method === 'GET') {
			const userId = url.searchParams.get('user_id') ?? undefined;
			return handleGetApprovedVideos(env, userId);
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

		// ─── Likes ────────────────────────────────────────────────
		if (url.pathname.match(/^\/api\/videos\/[^/]+\/like$/) && request.method === 'POST') {
			const videoId = url.pathname.split('/')[3];
			return handleLikeVideo(videoId, request, env);
		}

		if (url.pathname.match(/^\/api\/videos\/[^/]+\/like$/) && request.method === 'DELETE') {
			const videoId = url.pathname.split('/')[3];
			return handleUnlikeVideo(videoId, request, env);
		}

		if (url.pathname.match(/^\/api\/videos\/[^/]+\/likes$/) && request.method === 'GET') {
			const videoId = url.pathname.split('/')[3];
			return handleGetVideoLikes(videoId, env);
		}

		// ─── Saves ────────────────────────────────────────────────
		if (url.pathname.match(/^\/api\/videos\/[^/]+\/save$/) && request.method === 'POST') {
			const videoId = url.pathname.split('/')[3];
			return handleSaveVideo(videoId, request, env);
		}

		if (url.pathname.match(/^\/api\/videos\/[^/]+\/save$/) && request.method === 'DELETE') {
			const videoId = url.pathname.split('/')[3];
			return handleUnsaveVideo(videoId, request, env);
		}

		// ─── Views ────────────────────────────────────────────────
		if (url.pathname.match(/^\/api\/videos\/[^/]+\/view$/) && request.method === 'POST') {
			const videoId = url.pathname.split('/')[3];
			return handleRecordView(videoId, request, env);
		}

		// ─── Comments ─────────────────────────────────────────────
		if (url.pathname.match(/^\/api\/videos\/[^/]+\/comments$/) && request.method === 'POST') {
			const videoId = url.pathname.split('/')[3];
			return handleAddComment(videoId, request, env);
		}

		if (url.pathname.match(/^\/api\/videos\/[^/]+\/comments$/) && request.method === 'GET') {
			const videoId = url.pathname.split('/')[3];
			return handleGetComments(videoId, env);
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

		if (url.pathname === '/api/users/upload-profile-image' && request.method === 'POST') {
			return handleUploadProfileImage(request, env);
		}

		// ─── User profiles ─────────────────────────────────────────
		// These specific routes MUST come before the general /api/users/:id route
		if (url.pathname.match(/^\/api\/users\/[^/]+\/liked-videos$/) && request.method === 'GET') {
			const userId = url.pathname.split('/')[3];
			return handleGetUserLikedVideos(userId, env);
		}

		if (url.pathname.match(/^\/api\/users\/[^/]+\/saved-videos$/) && request.method === 'GET') {
			const userId = url.pathname.split('/')[3];
			return handleGetUserSavedVideos(userId, env);
		}

		// General profile route — must come LAST among /api/users/ GET routes
		if (url.pathname.startsWith('/api/users/') && request.method === 'GET') {
			const userId = url.pathname.split('/api/users/')[1];
			const viewerId = url.searchParams.get('viewer_id') ?? undefined;
			return handleGetUserProfile(userId, env, viewerId);
		}

		if (url.pathname === '/healthz') {
			return new Response('ok', { headers: CORS });
		}

		return new Response('Not found', { status: 404, headers: CORS });
	},
};
