import { Env, CORS } from '../types';

// Helper: get or create a conversation between two users
export async function handleStartConversation(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { user_id: string; other_user_id: string };

	if (!body.user_id || !body.other_user_id) {
		return Response.json({ error: 'user_id and other_user_id are required' }, { status: 400, headers: CORS });
	}

	if (body.user_id === body.other_user_id) {
		return Response.json({ error: 'Cannot start a conversation with yourself' }, { status: 400, headers: CORS });
	}

	// Always store the lexicographically smaller id as user_one_id, to avoid duplicate conversations
	const [userOneId, userTwoId] = [body.user_id, body.other_user_id].sort();

	// Check if a conversation already exists between these two users
	const existing = await env.DB.prepare(`SELECT id FROM conversations WHERE user_one_id = ? AND user_two_id = ?`)
		.bind(userOneId, userTwoId)
		.first<{ id: string }>();

	if (existing) {
		return Response.json({ id: existing.id }, { headers: CORS });
	}

	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();

	await env.DB.prepare(`INSERT INTO conversations (id, user_one_id, user_two_id, created_at) VALUES (?, ?, ?, ?)`)
		.bind(id, userOneId, userTwoId, createdAt)
		.run();

	return Response.json({ id }, { headers: CORS });
}

// List all of a user's conversations — NOT paginated, per spec
export async function handleGetConversations(userId: string, env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT 
       conversations.id,
       conversations.last_message_at,
       conversations.last_message_text,
       CASE WHEN conversations.user_one_id = ? THEN conversations.user_two_id ELSE conversations.user_one_id END as other_user_id,
       users.username as other_username,
       users.profile_image as other_profile_image
     FROM conversations
     JOIN users ON users.id = CASE WHEN conversations.user_one_id = ? THEN conversations.user_two_id ELSE conversations.user_one_id END
     WHERE conversations.user_one_id = ? OR conversations.user_two_id = ?
     ORDER BY conversations.last_message_at DESC`,
	)
		.bind(userId, userId, userId, userId)
		.all();

	return Response.json(result.results, { headers: CORS });
}

// Paginated message history for one conversation
export async function handleGetMessages(conversationId: string, env: Env, cursor?: string, limit: number = 20): Promise<Response> {
	const safeLimit = Math.min(Math.max(limit, 1), 50);
	const cursorClause = cursor ? `AND created_at < ?` : '';

	const query = `SELECT id, conversation_id, sender_id, text, created_at
     FROM messages
     WHERE conversation_id = ? ${cursorClause}
     ORDER BY created_at DESC
     LIMIT ?`;

	const stmt = cursor
		? env.DB.prepare(query).bind(conversationId, cursor, safeLimit + 1)
		: env.DB.prepare(query).bind(conversationId, safeLimit + 1);

	const result = await stmt.all();
	const rows = result.results as any[];

	const hasMore = rows.length > safeLimit;
	const messages = hasMore ? rows.slice(0, safeLimit) : rows;
	const nextCursor = hasMore ? messages[messages.length - 1].created_at : null;

	return Response.json({ messages, nextCursor }, { headers: CORS });
}

// Send a message — writes to D1 (Stage 3 will also notify the Durable Object from here)
export async function handleSendMessage(conversationId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { sender_id: string; text: string };

	if (!body.sender_id || !body.text) {
		return Response.json({ error: 'sender_id and text are required' }, { status: 400, headers: CORS });
	}

	if (body.text.trim().length === 0) {
		return Response.json({ error: 'Message cannot be empty' }, { status: 400, headers: CORS });
	}

	// Confirm the conversation exists and the sender is actually a participant
	const conversation = await env.DB.prepare(`SELECT user_one_id, user_two_id FROM conversations WHERE id = ?`)
		.bind(conversationId)
		.first<{ user_one_id: string; user_two_id: string }>();

	if (!conversation) {
		return Response.json({ error: 'Conversation not found' }, { status: 404, headers: CORS });
	}

	if (conversation.user_one_id !== body.sender_id && conversation.user_two_id !== body.sender_id) {
		return Response.json({ error: 'You are not a participant in this conversation' }, { status: 403, headers: CORS });
	}

	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();
	const trimmedText = body.text.trim();

	await env.DB.prepare(`INSERT INTO messages (id, conversation_id, sender_id, text, created_at) VALUES (?, ?, ?, ?, ?)`)
		.bind(id, conversationId, body.sender_id, trimmedText, createdAt)
		.run();

	await env.DB.prepare(`UPDATE conversations SET last_message_at = ?, last_message_text = ? WHERE id = ?`)
		.bind(createdAt, trimmedText, conversationId)
		.run();

	return Response.json(
		{ id, conversation_id: conversationId, sender_id: body.sender_id, text: trimmedText, created_at: createdAt },
		{ headers: CORS },
	);
}
