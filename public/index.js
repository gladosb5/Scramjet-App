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
scramjet.init();
debugLog("Scramjet init requested");

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
debugLog("BareMux connection created");

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	debugLog("form submit", address.value);

	try {
		debugLog("registering service worker");
		await registerSW();
		debugLog("service worker registered");
	} catch (err) {
		debugLog("service worker registration failed", err);
		error.textContent = "Failed to register service worker.";
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
	document.body.appendChild(frame.frame);
	debugLog("proxy frame created");

	frame.go(url);
	debugLog("navigating proxy frame", url);
});
