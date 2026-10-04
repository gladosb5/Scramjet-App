importScripts("/webkit-stream-shim.js", "/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

function formatDebugValue(value) {
	if (typeof value === "string") return value;
	if (value instanceof Error) return value.stack || value.message;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

async function swLog(...args) {
	try {
		const windows = await self.clients.matchAll({
			type: "window",
			includeUncontrolled: true,
		});
		const payload = {
			scramjetDebug: true,
			args: args.map(formatDebugValue),
		};
		for (const client of windows) client.postMessage(payload);
	} catch {
		// Debug logging must never break proxy requests.
	}
}

async function handleRequest(event) {
	const isNavigation =
		event.request.mode === "navigate" ||
		event.request.destination === "document" ||
		event.request.destination === "iframe";

	try {
		if (isNavigation) {
			await swLog(
				"fetch",
				event.request.method,
				event.request.destination || "(no destination)",
				event.request.url,
				"webkitCompat=",
				globalThis.__scramjetWebKitCompat || "none"
			);
		}

		await scramjet.loadConfig();

		if (!scramjet.config) {
			throw new Error("Scramjet config is unavailable after loadConfig()");
		}

		if (isNavigation) {
			await swLog("config ready", "prefix=", scramjet.config.prefix);
		}

		if (scramjet.route(event)) {
			if (isNavigation) await swLog("route matched Scramjet");
			const response = await scramjet.fetch(event);
			if (isNavigation) {
				await swLog(
					"Scramjet response",
					response.status,
					response.statusText,
					response.headers.get("content-type") || "(no content-type)"
				);
			}
			return response;
		}

		if (isNavigation) await swLog("route bypassed Scramjet");
		return fetch(event.request);
	} catch (err) {
		await swLog(
			"FETCH ERROR",
			event.request.url,
			err?.stack || err?.message || String(err)
		);
		throw err;
	}
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([
			self.clients.claim(),
			swLog("service worker activate"),
		])
	);
});
