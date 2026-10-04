(() => {
	"use strict";

	const lines = [];
	const maxLines = 500;
	let output = null;

	function stringify(value) {
		if (typeof value === "string") return value;
		if (value instanceof Error) return value.stack || value.message;
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}

	function render() {
		if (!output) return;
		output.textContent = lines.join("\n");
		output.scrollTop = output.scrollHeight;
	}

	function log(...args) {
		const time = new Date().toLocaleTimeString();
		const message = args.map(stringify).join(" ");
		lines.push(`>(log) [${time}] ${message}`);
		if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
		render();
	}

	globalThis.scramjetDebugLog = log;

	for (const method of ["log", "info", "warn", "error", "debug"]) {
		const original = console[method]?.bind(console);
		if (!original) continue;

		console[method] = (...args) => {
			log(method.toUpperCase(), ...args);
			original(...args);
		};
	}

	addEventListener("error", (event) => {
		log(
			"WINDOW ERROR",
			event.message,
			event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : ""
		);
	});

	addEventListener("unhandledrejection", (event) => {
		log("UNHANDLED REJECTION", event.reason);
	});

	addEventListener("DOMContentLoaded", () => {
		output = document.createElement("pre");
		output.id = "sj-debug-log";
		output.setAttribute("aria-label", "Scramjet debug log");
		document.body.appendChild(output);
		log("debug logger ready", navigator.userAgent);
	});
})();
