export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// Routes
		if (url.pathname === '/api/youtube/shorts' && request.method === 'GET') {
			return handleYoutubeShorts(request, env, corsHeaders);
		}

		if (url.pathname === '/healthz') {
			return new Response('ok', { headers: corsHeaders });
		}

		return new Response('Not found', { status: 404, headers: corsHeaders });
	},
};

async function handleYoutubeShorts(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
	const url = new URL(request.url);
	const pageToken = url.searchParams.get('pageToken') || '';
	const apiKey = env.YOUTUBE_API_KEY;

	if (!apiKey) {
		return Response.json({ error: 'YouTube API key not configured' }, { status: 500, headers: corsHeaders });
	}

	// Use videos.list with mostPopular instead of search
	const params = new URLSearchParams({
		part: 'snippet,statistics,contentDetails',
		chart: 'mostPopular',
		maxResults: '50', // fetch more so we have enough after filtering
		key: apiKey,
		...(pageToken && { pageToken }),
	});

	const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
	const data: any = await res.json();

	if (!data.items || data.items.length === 0) {
		return Response.json({ videos: [], nextPageToken: '' }, { headers: corsHeaders });
	}

	// Filter to shorts only (<=60 seconds)
	const videos = [];
	for (const item of data.items) {
		const duration = item.contentDetails?.duration || '';
		if (!isShort(duration)) continue;

		videos.push({
			id: item.id,
			title: item.snippet?.title || '',
			thumbnail: item.snippet?.thumbnails?.high?.url || '',
			channel_name: item.snippet?.channelTitle || '',
			view_count: item.statistics?.viewCount || '0',
			embed_url: `https://www.youtube.com/embed/${item.id}`,
		});
	}

	return Response.json({ videos, nextPageToken: data.nextPageToken || '' }, { headers: corsHeaders });
}

function isShort(duration: string): boolean {
	let minutes = 0;
	let seconds = 0;

	const minMatch = duration.match(/(\d+)M/);
	const secMatch = duration.match(/(\d+)S/);

	if (minMatch) minutes = parseInt(minMatch[1]);
	if (secMatch) seconds = parseInt(secMatch[1]);

	const total = minutes * 60 + seconds;
	return total > 0 && total <= 60;
}
