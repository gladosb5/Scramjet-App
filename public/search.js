"use strict";
/**
 *
 * @param {string} input
 * @param {string} template Template for a search query.
 * @returns {string} Fully qualified URL
 */
function search(input, template) {
	try {
		// input is a valid URL:
		// eg: https://example.com, https://example.com/test?q=param
		const url = new URL(input);
		// only web URLs; "hello:world" would otherwise parse as a "hello:" scheme
		if (url.protocol === "http:" || url.protocol === "https:")
			return url.toString();
	} catch (err) {
		// input was not a valid URL
	}

	try {
		// input is a valid URL when http:// is added to the start:
		// eg: example.com, https://example.com/test?q=param
		const url = new URL(`http://${input}`);
		// only if the hostname ends in a real-looking TLD (rejects "a.b", "3.14")
		// ponytail: bare IPs like 1.1.1.1 search too; type http:// to visit one
		if (/\.[a-z]{2,}$/i.test(url.hostname)) return url.toString();
	} catch (err) {
		// input was not valid URL
	}

	// input may have been a valid URL, however the hostname was invalid

	// Attempts to convert the input to a fully qualified URL have failed
	// Treat the input as a search query
	return template.replace("%s", encodeURIComponent(input));
}
