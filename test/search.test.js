import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const search = new Function(
	readFileSync(new URL("../public/search.js", import.meta.url), "utf8") +
		"\nreturn search;"
)();
const G = "https://www.google.com/search?q=%s";

test("random input searches Google", () => {
	for (const s of [
		"a",
		"!",
		"x:y",
		"hello:world",
		"a:",
		"1.5",
		"3.14",
		"a.b",
		"c++",
		"foo.bar baz",
		"localhost:8080",
	])
		assert.equal(search(s, G), G.replace("%s", encodeURIComponent(s)), s);
});

test("real URLs navigate", () => {
	assert.equal(search("example.com", G), "http://example.com/");
	assert.equal(
		search("en.wikipedia.org/wiki/WebKit", G),
		"http://en.wikipedia.org/wiki/WebKit"
	);
	assert.equal(search("https://x.com", G), "https://x.com/");
	assert.equal(search("http://1.1.1.1", G), "http://1.1.1.1/");
});
