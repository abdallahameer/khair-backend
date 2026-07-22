export class ConversationRoom {
	sessions: Set<WebSocket>;

	constructor(state: DurableObjectState, env: any) {
		this.sessions = new Set();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Internal call from handleSendMessage — broadcast a message to connected clients
		if (url.pathname.endsWith('/broadcast')) {
			const message = await request.json();
			this.broadcast(message);
			return new Response('ok');
		}

		// Otherwise, expect a WebSocket upgrade request from a client
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

	broadcast(message: unknown) {
		const data = JSON.stringify(message);
		for (const session of this.sessions) {
			try {
				session.send(data);
			} catch {
				this.sessions.delete(session);
			}
		}
	}
}
