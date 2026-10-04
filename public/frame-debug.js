(() => {
	"use strict";

	if (window === window.top) return;

	const nativePostMessage = window.parent.postMessage.bind(window.parent);

	function stringify(value) {
		if (typeof value === "string") return value;
		if (value instanceof Error) return value.stack || value.message;
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}

	function send(...args) {
		try {
			nativePostMessage(
				{
					scramjetFrameDebug: true,
					args: args.map(stringify),
				},
				location.origin
			);
		} catch {}
	}

	for (const method of ["log", "info", "warn", "error", "debug"]) {
		const original = console[method]?.bind(console);
		if (!original) continue;

		console[method] = (...args) => {
			send(method.toUpperCase(), ...args);
			original(...args);
		};
	}

	addEventListener("error", (event) => {
		send(
			"FRAME ERROR",
			event.message,
			event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : ""
		);
	});

	addEventListener("unhandledrejection", (event) => {
		send("FRAME UNHANDLED REJECTION", event.reason);
	});

	send("frame debug bridge ready", location.href);
})();
