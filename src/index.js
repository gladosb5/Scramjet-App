import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "CHANGE_ME_PASSWORD";
const AUTH_COOKIE = "sj_auth";
const AUTH_TOKEN = createHash("sha256")
	.update("scramjet-access:" + ACCESS_PASSWORD)
	.digest("hex");

function getCookie(req, name) {
	const raw = req.headers.cookie || "";
	for (const part of raw.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		const key = part.slice(0, index).trim();
		if (key !== name) continue;
		return decodeURIComponent(part.slice(index + 1).trim());
	}
	return "";
}

function safeEqual(left, right) {
	const a = Buffer.from(String(left));
	const b = Buffer.from(String(right));
	return a.length === b.length && timingSafeEqual(a, b);
}

function isAuthorized(req) {
	return safeEqual(getCookie(req, AUTH_COOKIE), AUTH_TOKEN);
}

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
	allow_udp_streams: false,
	hostname_blacklist: [/example\.com/],
	dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.endsWith("/wisp/") && isAuthorized(req)) {
					wisp.routeRequest(req, socket, head);
				} else {
					socket.end();
				}
			});
	},
});

fastify.addHook("onRequest", async (request, reply) => {
	const path = (request.raw.url || "/").split("?")[0];

	if (path === "/login.html" || path === "/auth") return;
	if (isAuthorized(request.raw)) return;

	if (path === "/") {
		return reply.redirect("/login.html");
	}

	return reply.code(401).type("text/plain").send("Unauthorized");
});

fastify.post("/auth", async (request, reply) => {
	const supplied =
		request.body && typeof request.body.password === "string"
			? request.body.password
			: "";

	if (!safeEqual(supplied, ACCESS_PASSWORD)) {
		return reply.code(401).send({ ok: false });
	}

	reply.header(
		"Set-Cookie",
		AUTH_COOKIE +
			"=" +
			encodeURIComponent(AUTH_TOKEN) +
			"; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800"
	);

	return { ok: true };
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.setNotFoundHandler((res, reply) => {
	return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	console.log("Listening on:");
	console.log("\thttp://localhost:" + address.port);
	console.log("\thttp://" + hostname() + ":" + address.port);
	console.log(
		"\thttp://" +
			(address.family === "IPv6" ? "[" + address.address + "]" : address.address) +
			":" +
			address.port
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});
