export interface Env {
	DB: D1Database;
	VIDEOS_BUCKET: R2Bucket;
	IMAGES_BUCKET: R2Bucket;
	R2_PUBLIC_URL: string;
	R2_PUBLIC_URL_IMAGES: string;
}

export const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};
