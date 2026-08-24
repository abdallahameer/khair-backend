import { Env, CORS } from '../types';

// Combined search — returns both videos and users matching the query in
// one response, so the frontend only needs one request.
export async function handleSearch(
	env: Env,
	query: string,
	userId?: string,
	videoOffset: number = 0,
	videoLimit: number = 10,
	userOffset: number = 0,
	userLimit: number = 5,
): Promise<Response> {
	const trimmed = query.trim();

	if (!trimmed) {
		return Response.json(
			{ videos: [], users: [], hasMoreVideos: false, nextVideoOffset: 0, hasMoreUsers: false, nextUserOffset: 0 },
			{ headers: CORS },
		);
	}

	const safeVideoLimit = Math.min(Math.max(videoLimit, 1), 50);
	const safeVideoOffset = Math.max(videoOffset, 0);
	const safeUserLimit = Math.min(Math.max(userLimit, 1), 50);
	const safeUserOffset = Math.max(userOffset, 0);

	const searchTerm = `%${trimmed}%`;

	// ─── Videos ───────────────────────────────────────────────
	const scoreWithFollow = `
		(
			(videos.likes_count * 5) +
			(videos.views_count * 3) +
			(videos.saves_count * 2) +
			(CASE WHEN follows.follower_id IS NOT NULL THEN 15 ELSE 0 END)
		) / ((julianday('now') - julianday(videos.uploaded_at)) + 2)
	`;

	const scoreNoFollow = `
		(
			(videos.likes_count * 5) +
			(videos.views_count * 3) +
			(videos.saves_count * 2)
		) / ((julianday('now') - julianday(videos.uploaded_at)) + 2)
	`;

	const videoMatchClause = `AND (videos.description LIKE ? OR users.username LIKE ? OR videos.category LIKE ?)`;

	const videoSql = userId
		? `SELECT 
         videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         EXISTS(SELECT 1 FROM likes WHERE likes.video_id = videos.id AND likes.user_id = ?) as is_liked,
         EXISTS(SELECT 1 FROM saves WHERE saves.video_id = videos.id AND saves.user_id = ?) as is_saved,
         CASE WHEN follows.follower_id IS NOT NULL THEN 1 ELSE 0 END as is_following,
         ${scoreWithFollow} as score
       FROM videos
       JOIN users ON videos.user_id = users.id
       LEFT JOIN follows ON follows.follower_id = ? AND follows.following_id = videos.user_id
       WHERE videos.status = 'approved' ${videoMatchClause}
       ORDER BY score DESC, videos.uploaded_at DESC
       LIMIT ? OFFSET ?`
		: `SELECT 
         videos.id, videos.video_url, videos.uploaded_at, videos.description, videos.category,
         videos.likes_count, videos.comments_count, videos.views_count, videos.saves_count,
         users.id as user_id, users.username, users.profile_image,
         0 as is_liked, 0 as is_saved, 0 as is_following,
         ${scoreNoFollow} as score
       FROM videos
       JOIN users ON videos.user_id = users.id
       WHERE videos.status = 'approved' ${videoMatchClause}
       ORDER BY score DESC, videos.uploaded_at DESC
       LIMIT ? OFFSET ?`;

	const videoBindings: any[] = userId ? [userId, userId, userId] : [];
	videoBindings.push(searchTerm, searchTerm, searchTerm, safeVideoLimit + 1, safeVideoOffset);

	const videoResult = await env.DB.prepare(videoSql)
		.bind(...videoBindings)
		.all();
	const videoRows = videoResult.results as any[];
	const hasMoreVideos = videoRows.length > safeVideoLimit;
	const videos = hasMoreVideos ? videoRows.slice(0, safeVideoLimit) : videoRows;

	// ─── Users ────────────────────────────────────────────────
	// Ranked by match quality first (exact > starts-with > contains), then follower count
	const userMatchRank = `
		CASE
			WHEN users.username = ? THEN 3
			WHEN users.username LIKE ? THEN 2
			ELSE 1
		END
	`;

	const userSql = userId
		? `SELECT
         users.id, users.username, users.profile_image,
         (SELECT COUNT(*) FROM follows WHERE follows.following_id = users.id) as followers_count,
         EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = ? AND follows.following_id = users.id) as is_following
       FROM users
       WHERE users.username LIKE ?
       ORDER BY ${userMatchRank} DESC, followers_count DESC
       LIMIT ? OFFSET ?`
		: `SELECT
         users.id, users.username, users.profile_image,
         (SELECT COUNT(*) FROM follows WHERE follows.following_id = users.id) as followers_count,
         0 as is_following
       FROM users
       WHERE users.username LIKE ?
       ORDER BY ${userMatchRank} DESC, followers_count DESC
       LIMIT ? OFFSET ?`;

	const startsWithTerm = `${trimmed}%`;

	const userBindings: any[] = userId ? [userId] : [];
	userBindings.push(searchTerm, trimmed, startsWithTerm, safeUserLimit + 1, safeUserOffset);

	const userResult = await env.DB.prepare(userSql)
		.bind(...userBindings)
		.all();
	const userRows = userResult.results as any[];
	const hasMoreUsers = userRows.length > safeUserLimit;
	const users = hasMoreUsers ? userRows.slice(0, safeUserLimit) : userRows;

	return Response.json(
		{
			videos,
			users,
			hasMoreVideos,
			nextVideoOffset: safeVideoOffset + videos.length,
			hasMoreUsers,
			nextUserOffset: safeUserOffset + users.length,
		},
		{ headers: CORS },
	);
}
