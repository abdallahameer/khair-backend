export interface Env {
	DB: D1Database;
	PENDING_BUCKET: R2Bucket;
	APPROVED_BUCKET: R2Bucket;
	PENDING_PUBLIC_URL: string;
	APPROVED_PUBLIC_URL: string;
}

export const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};
