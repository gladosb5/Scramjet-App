"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const loading = document.getElementById("sj-loading");
const loadingLog = document.getElementById("sj-loading-log");

function status(message) {
	loading.hidden = false;
	loadingLog.textContent += "> " + message + "\n";
	loadingLog.scrollTop = loadingLog.scrollHeight;
}

function fail(message) {
	status("error: " + message);
}

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

const scramjetReady = scramjet.init();
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	if (!address.value.trim()) return;

	loadingLog.textContent = "";
	status("input accepted");
	status("resolving destination");

	const url = search(address.value, searchEngine.value);
	status("destination resolved");
	status("waiting for runtime initialization");

	try {
		await scramjetReady;
		status("runtime initialized");

		status("registering background worker");
		const registration = await registerSW();
		status(
			"background worker ready" +
				(registration.active?.state ? " (" + registration.active.state + ")" : "")
		);

		const wispUrl =
			(location.protocol === "https:" ? "wss" : "ws") +
			"://" +
			location.host +
			"/wisp/";

		status("checking network transport");
		const transport = await connection.getTransport();

		if (transport !== "/libcurl/index.mjs") {
			status("configuring network transport");
			await connection.setTransport("/libcurl/index.mjs", [
				{ websocket: wispUrl },
			]);
			status("network transport ready");
		} else {
			status("network transport already ready");
		}

		status("creating browsing context");
		const frame = scramjet.createFrame();
		frame.frame.id = "sj-frame";

		let navigationStarted = false;
		let finished = false;

		const finish = () => {
			if (finished || !navigationStarted) return;
			finished = true;
			status("document loaded");
			setTimeout(() => {
				loading.remove();
			}, 120);
		};

		frame.frame.addEventListener("load", finish);
		frame.frame.addEventListener("error", () => {
			fail("document failed to load");
		});

		document.body.appendChild(frame.frame);
		status("browsing context attached");
		status("starting navigation");

		navigationStarted = true;
		frame.go(url);
		status("request sent");
		status("waiting for remote document");
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
});
