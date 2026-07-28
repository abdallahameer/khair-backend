import { Env } from '../types';

export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
	try {
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: 'onboarding@resend.dev',
				to,
				subject,
				html,
			}),
		});

		return response.ok;
	} catch {
		return false;
	}
}
