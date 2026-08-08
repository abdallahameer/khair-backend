import { Env, CORS } from './types';
import {
	handleReviewerLogin,
	handleUserLogin,
	handleUserRegister,
	handleGetUserProfile,
	handleGetUserVideos,
	handleUploadProfileImage,
	handleAddEmail,
	handleForgotPassword,
	handleResetPassword,
} from './handlers/auth';
import { handleFollowUser, handleUnfollowUser } from './handlers/follows';
import {
	handleGetApprovedVideos,
	handleGetPendingVideos,
	handleUploadVideo,
	handleApproveVideo,
	handleRejectVideo,
	handleGetVideoById,
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
import {
	handleStartConversation,
	handleGetConversations,
	handleGetMessages,
	handleSendMessage,
	handleFindConversation,
	handleSendMessageToUser,
	handleMarkConversationRead,
	handleDeleteMessage,
	handleUpdateMessage,
	handleDeleteConversation,
} from './handlers/messaging';
import { handleReportVideo, handleGetReports, handleDeleteReportedVideo } from './handlers/reports';
import { ConversationRoom } from './durable-objects/ConversationRoom';
import { UserInbox } from './durable-objects/UserInbox';

export { ConversationRoom, UserInbox };
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS });
		}

		// ─── Videos ───────────────────────────────────────────────

		if (url.pathname === '/api/videos/approved' && request.method === 'GET') {
			const userId = url.searchParams.get('user_id') ?? undefined;
			const cursor = url.searchParams.get('cursor') ?? undefined;
			const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
			return handleGetApprovedVideos(env, userId, cursor, limit);
		}

		if (url.pathname === '/api/videos/pending' && request.method === 'GET') {
			return handleGetPendingVideos(env);
		}

		// Must come before other /api/videos/ routes
		if (url.pathname.match(/^\/api\/videos\/[^/]+$/) && request.method === 'GET') {
			const videoId = url.pathname.split('/')[3];
			const viewerId = url.searchParams.get('viewer_id') ?? undefined;
			return handleGetVideoById(videoId, env, viewerId);
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

		if (url.pathname.match(/^\/api\/videos\/[^/]+\/report$/) && request.method === 'POST') {
			const videoId = url.pathname.split('/')[3];
			return handleReportVideo(videoId, request, env);
		}
		if (url.pathname === '/api/reports' && request.method === 'GET') {
			return handleGetReports(env);
		}

		if (url.pathname.match(/^\/api\/reports\/video\/[^/]+$/) && request.method === 'DELETE') {
			const videoId = url.pathname.split('/')[4];
			return handleDeleteReportedVideo(videoId, env);
		}

		// ─── Auth ─────────────────────────────────────────────────
		if (url.pathname === '/api/auth/reviewer-login' && request.method === 'POST') {
			return handleReviewerLogin(request, env);
		}

		if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
			return handleForgotPassword(request, env);
		}

		if (url.pathname === '/api/auth/reset-password' && request.method === 'POST') {
			return handleResetPassword(request, env);
		}

		if (url.pathname === '/api/users/add-email' && request.method === 'POST') {
			return handleAddEmail(request, env);
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

		if (url.pathname.match(/^\/api\/users\/[^/]+\/videos$/) && request.method === 'GET') {
			const userId = url.pathname.split('/')[3];
			const viewerId = url.searchParams.get('viewer_id') ?? undefined;
			const cursor = url.searchParams.get('cursor') ?? undefined;
			const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
			return handleGetUserVideos(userId, env, viewerId, cursor, limit);
		}

		if (url.pathname.match(/^\/api\/users\/[^/]+\/liked-videos$/) && request.method === 'GET') {
			const userId = url.pathname.split('/')[3];
			const cursor = url.searchParams.get('cursor') ?? undefined;
			const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
			return handleGetUserLikedVideos(userId, env, cursor, limit);
		}

		if (url.pathname.match(/^\/api\/users\/[^/]+\/saved-videos$/) && request.method === 'GET') {
			const userId = url.pathname.split('/')[3];
			const cursor = url.searchParams.get('cursor') ?? undefined;
			const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
			return handleGetUserSavedVideos(userId, env, cursor, limit);
		}

		if (url.pathname.match(/^\/api\/users\/[^/]+\/inbox-ws$/) && request.method === 'GET') {
			const userId = url.pathname.split('/')[3];
			const durableObjectId = env.USER_INBOX.idFromName(userId);
			const stub = env.USER_INBOX.get(durableObjectId);
			return stub.fetch(request);
		}

		if (url.pathname.match(/^\/api\/users\/[^/]+\/follow$/) && request.method === 'POST') {
			const userId = url.pathname.split('/')[3];
			return handleFollowUser(userId, request, env);
		}

		if (url.pathname.match(/^\/api\/users\/[^/]+\/follow$/) && request.method === 'DELETE') {
			const userId = url.pathname.split('/')[3];
			return handleUnfollowUser(userId, request, env);
		}

		// General profile route — now just user info, must stay LAST among /api/users/ GET routes
		if (url.pathname.startsWith('/api/users/') && request.method === 'GET') {
			const userId = url.pathname.split('/api/users/')[1];
			const viewerId = url.searchParams.get('viewer_id') ?? undefined;
			return handleGetUserProfile(userId, env, viewerId);
		}

		// ─── Messaging ────────────────────────────────────────────────

		if (url.pathname === '/api/conversations' && request.method === 'POST') {
			return handleStartConversation(request, env);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+\/messages\/[^/]+$/) && request.method === 'DELETE') {
			const parts = url.pathname.split('/');
			const conversationId = parts[3];
			const messageId = parts[5];
			return handleDeleteMessage(conversationId, messageId, request, env);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+\/messages\/[^/]+$/) && request.method === 'PATCH') {
			const parts = url.pathname.split('/');
			const conversationId = parts[3];
			const messageId = parts[5];
			return handleUpdateMessage(conversationId, messageId, request, env);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+$/) && request.method === 'DELETE') {
			const conversationId = url.pathname.split('/')[3];
			return handleDeleteConversation(conversationId, request, env);
		}

		if (url.pathname === '/api/conversations' && request.method === 'GET') {
			const userId = url.searchParams.get('user_id');
			if (!userId) {
				return Response.json({ error: 'user_id is required' }, { status: 400, headers: CORS });
			}
			return handleGetConversations(userId, env);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+\/messages$/) && request.method === 'GET') {
			const conversationId = url.pathname.split('/')[3];
			const cursor = url.searchParams.get('cursor') ?? undefined;
			const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 20;
			return handleGetMessages(conversationId, env, cursor, limit);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+\/messages$/) && request.method === 'POST') {
			const conversationId = url.pathname.split('/')[3];
			return handleSendMessage(conversationId, request, env);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+\/ws$/) && request.method === 'GET') {
			const conversationId = url.pathname.split('/')[3];
			const durableObjectId = env.CONVERSATION_ROOM.idFromName(conversationId);
			const stub = env.CONVERSATION_ROOM.get(durableObjectId);
			return stub.fetch(request);
		}

		if (url.pathname === '/api/conversations/find' && request.method === 'GET') {
			const userId = url.searchParams.get('user_id');
			const otherUserId = url.searchParams.get('other_user_id');
			if (!userId || !otherUserId) {
				return Response.json({ error: 'user_id and other_user_id are required' }, { status: 400, headers: CORS });
			}
			return handleFindConversation(userId, otherUserId, env);
		}

		if (url.pathname === '/api/messages' && request.method === 'POST') {
			return handleSendMessageToUser(request, env);
		}

		if (url.pathname.match(/^\/api\/conversations\/[^/]+\/read$/) && request.method === 'POST') {
			const conversationId = url.pathname.split('/')[3];
			return handleMarkConversationRead(conversationId, request, env);
		}

		if (url.pathname === '/healthz') {
			return new Response('ok', { headers: CORS });
		}

		return new Response('Not found', { status: 404, headers: CORS });
	},
};
