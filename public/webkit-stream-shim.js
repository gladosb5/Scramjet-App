/*
 * WebKit compatibility shim for Scramjet's transferable ReadableStream paths.
 *
 * Safari/WebKit can expose ReadableStream without allowing it to be transferred
 * through postMessage. Scramjet v1 uses transferable streams for its emulated
 * service-worker request/response channel. When WebKit rejects that transfer,
 * buffer only those message bodies to ArrayBuffer and send those instead.
 *
 * Browsers that support transferable streams keep the native fast path.
 */
(() => {
	"use strict";

	if (
		typeof ReadableStream === "undefined" ||
		typeof MessageChannel === "undefined" ||
		typeof MessagePort === "undefined"
	) {
		return;
	}

	const nativeMessagePortPostMessage = MessagePort.prototype.postMessage;

	function canTransferReadableStream() {
		const channel = new MessageChannel();
		const stream = new ReadableStream({
			start(controller) {
				controller.close();
			},
		});

		try {
			nativeMessagePortPostMessage.call(channel.port1, stream, [stream]);
			return true;
		} catch {
			return false;
		} finally {
			try {
				channel.port1.close();
				channel.port2.close();
			} catch {
				// Ignore cleanup failures on older WebKit builds.
			}
		}
	}

	if (canTransferReadableStream()) {
		globalThis.__scramjetWebKitCompat = {
			streamTransferSupported: true,
			bufferFallbackEnabled: false,
		};
		return;
	}

	const queues = new WeakMap();
	const streamBuffers = new WeakMap();

	function isReadableStream(value) {
		return (
			value !== null &&
			typeof value === "object" &&
			typeof value.getReader === "function" &&
			typeof value.tee === "function"
		);
	}

	function isPlainObject(value) {
		if (value === null || typeof value !== "object") return false;
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	}

	function containsReadableStream(value, seen = new WeakSet()) {
		if (isReadableStream(value)) return true;
		if (value === null || typeof value !== "object") return false;
		if (seen.has(value)) return false;
		seen.add(value);

		if (Array.isArray(value)) {
			return value.some((item) => containsReadableStream(item, seen));
		}

		if (!isPlainObject(value)) return false;

		for (const key of Object.keys(value)) {
			if (containsReadableStream(value[key], seen)) return true;
		}
		return false;
	}

	async function toArrayBuffer(stream) {
		let promise = streamBuffers.get(stream);
		if (!promise) {
			promise = new Response(stream).arrayBuffer();
			streamBuffers.set(stream, promise);
		}
		return promise;
	}

	async function replaceReadableStreams(value, buffers, seen = new WeakMap()) {
		if (isReadableStream(value)) {
			const buffer = await toArrayBuffer(value);
			buffers.add(buffer);
			return buffer;
		}

		if (value === null || typeof value !== "object") return value;
		if (seen.has(value)) return seen.get(value);

		if (Array.isArray(value)) {
			const clone = [];
			seen.set(value, clone);
			for (const item of value) {
				clone.push(await replaceReadableStreams(item, buffers, seen));
			}
			return clone;
		}

		if (!isPlainObject(value)) return value;

		const clone = Object.create(Object.getPrototypeOf(value));
		seen.set(value, clone);
		for (const key of Object.keys(value)) {
			clone[key] = await replaceReadableStreams(value[key], buffers, seen);
		}
		return clone;
	}

	function transferListFrom(argument) {
		if (Array.isArray(argument)) return argument;
		if (
			argument &&
			typeof argument === "object" &&
			Array.isArray(argument.transfer)
		) {
			return argument.transfer;
		}
		return [];
	}

	function makeTransferArgument(original, transfer) {
		if (Array.isArray(original)) return transfer;
		if (original && typeof original === "object" && "transfer" in original) {
			return { ...original, transfer };
		}
		return transfer.length ? transfer : undefined;
	}

	function enqueue(target, task) {
		const previous = queues.get(target) || Promise.resolve();
		const next = previous.then(task, task);
		queues.set(
			target,
			next.catch((error) => {
				console.warn("Scramjet WebKit stream fallback failed:", error);
			})
		);
	}

	function patchPostMessage(prototype) {
		if (!prototype || typeof prototype.postMessage !== "function") return;

		const nativePostMessage = prototype.postMessage;
		if (nativePostMessage.__scramjetWebKitPatched) return;

		function patchedPostMessage(message, transferOrOptions) {
			const transfer = transferListFrom(transferOrOptions);
			const transferHasStream = transfer.some(isReadableStream);
			const messageHasStream = containsReadableStream(message);
			const hasPending = queues.has(this);

			if (!transferHasStream && !messageHasStream && !hasPending) {
				return nativePostMessage.call(this, message, transferOrOptions);
			}

			const target = this;
			enqueue(target, async () => {
				const buffers = new Set();
				const safeMessage = messageHasStream
					? await replaceReadableStreams(message, buffers)
					: message;

				const safeTransfer = transfer.filter((item) => !isReadableStream(item));
				for (const buffer of buffers) safeTransfer.push(buffer);

				const uniqueTransfer = [...new Set(safeTransfer)];
				const safeArgument = makeTransferArgument(
					transferOrOptions,
					uniqueTransfer
				);

				if (safeArgument === undefined) {
					nativePostMessage.call(target, safeMessage);
				} else {
					nativePostMessage.call(target, safeMessage, safeArgument);
				}
			});

			// Native postMessage returns undefined. Keep the same observable return value.
			return undefined;
		}

		Object.defineProperty(patchedPostMessage, "__scramjetWebKitPatched", {
			value: true,
		});
		prototype.postMessage = patchedPostMessage;
	}

	patchPostMessage(MessagePort.prototype);
	if (typeof Worker !== "undefined") patchPostMessage(Worker.prototype);
	if (typeof ServiceWorker !== "undefined") {
		patchPostMessage(ServiceWorker.prototype);
	}
	if (typeof Client !== "undefined") patchPostMessage(Client.prototype);

	globalThis.__scramjetWebKitCompat = {
		streamTransferSupported: false,
		bufferFallbackEnabled: true,
	};
})();
