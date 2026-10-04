"use strict";
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const debugLog = globalThis.scramjetDebugLog || (() => {});
debugLog("index.js loaded");

addEventListener("message", (event) => {
	if (event.origin !== location.origin) return;
	if (event.data?.scramjetFrameDebug) {
		debugLog("FRAME", ...(event.data.args || []));
	}
});

if (navigator.serviceWorker) {
	navigator.serviceWorker.addEventListener("message", (event) => {
		if (event.data?.scramjetDebug) {
			debugLog("SW", ...(event.data.args || []));
		}
	});
}

const { ScramjetController } = $scramjetLoadController();
debugLog("ScramjetController loaded");

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

debugLog("initializing Scramjet");
const scramjetReady = scramjet.init().then(
	() => {
		debugLog("Scramjet init complete");
	},
	(err) => {
		debugLog("Scramjet init failed", err);
		throw err;
	}
);

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
debugLog("BareMux connection created");

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	debugLog("form submit", address.value);

	try {
		debugLog("waiting for Scramjet init");
		await scramjetReady;
		debugLog("Scramjet ready");

		debugLog("registering service worker");
		const registration = await registerSW();
		debugLog(
			"service worker active",
			registration.active?.state || "unknown",
			registration.scope
		);
	} catch (err) {
		debugLog("startup failed", err);
		error.textContent = "Failed to initialize Scramjet.";
		errorCode.textContent = err.toString();
		throw err;
	}

	const url = search(address.value, searchEngine.value);
	debugLog("resolved URL", url);

	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";
	debugLog("Wisp URL", wispUrl);

	const transport = await connection.getTransport();
	debugLog("current transport", transport);

	if (transport !== "/libcurl/index.mjs") {
		debugLog("setting libcurl transport");
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
		debugLog("libcurl transport ready");
	}

	const frame = scramjet.createFrame();
	frame.frame.id = "sj-frame";

	frame.frame.addEventListener("load", () => {
		let href = "(unavailable)";
		try {
			href = frame.frame.contentWindow?.location?.href || href;
		} catch {}
		debugLog("proxy frame load", href);
	});

	frame.frame.addEventListener("error", (event) => {
		debugLog("proxy frame error", event);
	});

	document.body.appendChild(frame.frame);
	debugLog("proxy frame created");

	frame.go(url);
	debugLog("navigating proxy frame", url);
});
