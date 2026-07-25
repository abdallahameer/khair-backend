export class UserInbox {
	sessions: Set<WebSocket>;

	constructor(state: DurableObjectState, env: any) {
		this.sessions = new Set();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.endsWith('/notify')) {
			this.broadcast();
			return new Response('ok');
		}

		const upgradeHeader = request.headers.get('Upgrade');
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return new Response('Expected websocket', { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.handleSession(server);

		return new Response(null, { status: 101, webSocket: client });
	}

	handleSession(webSocket: WebSocket) {
		webSocket.accept();
		this.sessions.add(webSocket);

		webSocket.addEventListener('close', () => {
			this.sessions.delete(webSocket);
		});

		webSocket.addEventListener('error', () => {
			this.sessions.delete(webSocket);
		});
	}

	broadcast() {
		for (const session of this.sessions) {
			try {
				session.send(JSON.stringify({ type: 'conversations_updated' }));
			} catch {
				this.sessions.delete(session);
			}
		}
	}
}
