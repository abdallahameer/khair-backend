import { Env, CORS } from '../types';

// User reports a video — does NOT touch video status or visibility.
// It only creates a review record for the admin to look at later.
export async function handleReportVideo(videoId: string, request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { reporter_id: string; reason: string };

	if (!body.reporter_id) {
		return Response.json({ error: 'reporter_id is required' }, { status: 400, headers: CORS });
	}

	if (!body.reason || body.reason.trim().length === 0) {
		return Response.json({ error: 'A reason is required' }, { status: 400, headers: CORS });
	}

	if (body.reason.length > 1000) {
		return Response.json({ error: 'Reason is too long (max 1000 characters)' }, { status: 400, headers: CORS });
	}

	const video = await env.DB.prepare(`SELECT id FROM videos WHERE id = ?`).bind(videoId).first();

	if (!video) {
		return Response.json({ error: 'Video not found' }, { status: 404, headers: CORS });
	}

	const id = crypto.randomUUID();

	try {
		await env.DB.prepare(`INSERT INTO reports (id, video_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, videoId, body.reporter_id, body.reason.trim(), new Date().toISOString())
			.run();
	} catch {
		// Unique index on (video_id, reporter_id) — this user already reported this video
		return Response.json({ message: 'You have already reported this video' }, { headers: CORS });
	}

	return Response.json({ message: 'Video reported' }, { headers: CORS });
}

// Admin-facing: list every report with reporter + video-owner identity resolved.
// Intended for khair.live/videoReview.
export async function handleGetReports(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT 
       reports.id,
       reports.reason,
       reports.created_at,
       reports.reporter_id,
       reporter.username as reporter_username,
       reporter.profile_image as reporter_profile_image,
       videos.id as video_id,
       videos.video_url,
       videos.description,
       videos.category,
       videos.uploaded_at as video_uploaded_at,
       videos.user_id as video_owner_id,
       owner.username as video_owner_username,
       owner.profile_image as video_owner_profile_image
     FROM reports
     JOIN videos ON reports.video_id = videos.id
     JOIN users reporter ON reports.reporter_id = reporter.id
     JOIN users owner ON videos.user_id = owner.id
     ORDER BY reports.created_at DESC`,
	).all();

	return Response.json(result.results, { headers: CORS });
}

// Admin-facing: deny/dismiss a single report — removes just this report row.
// The video and any OTHER reports on it are untouched. Use this when a
// report turns out to be unfounded.
export async function handleDenyReport(reportId: string, env: Env): Promise<Response> {
	const report = await env.DB.prepare(`SELECT id FROM reports WHERE id = ?`).bind(reportId).first();

	if (!report) {
		return Response.json({ error: 'Report not found' }, { status: 404, headers: CORS });
	}

	await env.DB.prepare(`DELETE FROM reports WHERE id = ?`).bind(reportId).run();

	return Response.json({ message: 'Report denied' }, { headers: CORS });
}

// Admin-facing: manually delete a reported video — removes it from D1, R2, and
// clears its report rows. This is the ONLY thing that actually removes a video
// from the platform.
export async function handleDeleteReportedVideo(videoId: string, env: Env): Promise<Response> {
	const video = await env.DB.prepare(`SELECT id, video_url FROM videos WHERE id = ?`)
		.bind(videoId)
		.first<{ id: string; video_url: string }>();

	if (!video) {
		return Response.json({ error: 'Video not found' }, { status: 404, headers: CORS });
	}

	// Delete every row that references this video, and the video row itself,
	// as ONE atomic transaction. If any statement fails (e.g. a foreign key
	// constraint), the whole batch rolls back — nothing is left half-deleted.
	try {
		await env.DB.batch([
			env.DB.prepare(`DELETE FROM likes WHERE video_id = ?`).bind(videoId),
			env.DB.prepare(`DELETE FROM saves WHERE video_id = ?`).bind(videoId),
			env.DB.prepare(`DELETE FROM views WHERE video_id = ?`).bind(videoId),
			env.DB.prepare(`DELETE FROM comments WHERE video_id = ?`).bind(videoId),
			env.DB.prepare(`DELETE FROM reports WHERE video_id = ?`).bind(videoId),
			env.DB.prepare(`DELETE FROM videos WHERE id = ?`).bind(videoId),
		]);
	} catch (err) {
		console.error('Failed to delete video records:', err);
		return Response.json({ error: 'Failed to delete video from the database' }, { status: 500, headers: CORS });
	}

	// Only remove the actual file once every DB row is confirmed gone —
	// this way a DB failure never leaves an orphaned, unplayable video.
	const key = video.video_url.split('/').pop();
	if (key) await env.VIDEOS_BUCKET.delete(key);

	return Response.json({ message: 'Video deleted' }, { headers: CORS });
}
