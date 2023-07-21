/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import dedent from "dedent";
import { existsSync } from "fs";
import { ensureDir, readFileSync } from "fs-extra";
import { writeFile } from "fs/promises";
import levenshtein from "js-levenshtein";
import { parse, resolve } from "path";
import { compress, decompress } from "shrink-string";

function getBigrams(str: string) {
	const bigrams = new Set();
	for (let i = 0; i < str.length - 1; i += 1) {
		bigrams.add(str.substring(i, i + 2));
	}
	return bigrams;
}

function intersect(set1: Set<any>, set2: Set<any>) {
	return new Set([...set1].filter((x) => set2.has(x)));
}

function diceCoefficient(str1: string, str2: string) {
	const bigrams1 = getBigrams(str1);
	const bigrams2 = getBigrams(str2);
	return (
		(2 * intersect(bigrams1, bigrams2).size) /
		(bigrams1.size + bigrams2.size)
	);
}

const LICENSE_DATA_THRESHOLD = 0.9;
const LICENSE_SPDX_ACCREDIT_THRESHOLD = 0.9;

export class Detector {
	public constructor(
		public id: string,
		public license: string
	) {}

	public detect(licenseData: string) {
		const dedented = dedent`${this.license}`;

		const score = diceCoefficient(dedented, licenseData);

		if (score == 1 || score >= LICENSE_DATA_THRESHOLD) {
			return levenshtein(
				licenseData.toLowerCase(),
				dedented.toLowerCase()
			);
		} else {
			return Infinity;
		}
	}
}

export const fetchSPDXData = async () => {
	async function fetch() {
		const rootTree = await axios.get(
			"https://api.github.com/repos/spdx/license-list-data/git/trees/main"
		);

		const textTreeSha = rootTree.data.tree.find(
			(t: any) => t.path == "text"
		).sha;

		const textTree = await axios.get(
			`https://api.github.com/repos/spdx/license-list-data/git/trees/${textTreeSha}?recursive=1`
		);

		const ghRootTree = await axios.get(
			"https://api.github.com/repos/github/choosealicense.com/git/trees/gh-pages"
		);

		const ghLicenseTreeSha = ghRootTree.data.tree.find(
			(t: any) => t.path == "_licenses"
		).sha;

		const ghLicenseTree = await axios.get(
			`https://api.github.com/repos/github/choosealicense.com/git/trees/${ghLicenseTreeSha}?recursive=1`
		);

		const licenses = new Map();

		const filteredLicenses = textTree.data.tree.filter((r: any) =>
			ghLicenseTree.data.tree.find(
				(f: any) =>
					f.path.toLowerCase() ==
					`${parse(r.path).name}.txt`.toLowerCase()
			)
		);

		var i = 0;
		for (const { path } of filteredLicenses) {
			i++;

			console.log(
				`    ${path} (${i}/${filteredLicenses.length})`
			);

			const licenseData = await axios.get(
				`https://raw.githubusercontent.com/spdx/license-list-data/main/text/${path}`
			);

			licenses.set(parse(path).name, licenseData.data);
		}

		const serialised = JSON.stringify(Array.from(licenses));
		const compressed = await compress(serialised);

		await ensureDir(resolve(process.cwd(), "cache"));
		await writeFile(
			resolve(process.cwd(), "cache", "spdx.db"),
			JSON.stringify({
				ttl: Date.now() + 86400000 * 2,
				data: compressed
			})
		);

		return licenses;
	}

	if (existsSync(resolve(process.cwd(), "cache", "spdx.db"))) {
		const data = readFileSync(
			resolve(process.cwd(), "cache", "spdx.db"),
			"utf-8"
		);

		const json = JSON.parse(data);

		if (json.ttl >= Date.now()) {
			console.log("    Using cached database definitions...");

			const decompressed = JSON.parse(
				await decompress(json.data)
			);
			return new Map(decompressed);
		} else {
			console.log("    Definitions expired, refetching...");
			return await fetch();
		}
	} else {
		return await fetch();
	}
};

// Higher the number, the higher the accuracy
export const LICENSE_LINES_CUT_OFF = 50;

const licenseCache = new Map();

export const detectSPDXFromLicense = async (
	licenseIndex: Map<string, string>,
	service: string,
	pkg: string,
	ver: string,
	license: string,
	knownSPDXLicense?: string
) => {
	if (licenseCache.get(`${service}--${pkg}@${ver}`)) {
		return licenseCache.get(`${service}--${pkg}@${ver}`);
	}

	if (license.split("\n").length >= LICENSE_LINES_CUT_OFF) {
		console.warn(
			`                warn: License for '${pkg}' is being limited to the first ${LICENSE_LINES_CUT_OFF} lines due to length.`
		);
		license = license
			.split("\n")
			.slice(0, LICENSE_LINES_CUT_OFF)
			.join("\n");
	}

	const matches = new Map();

	var i = 0;
	for (let [spdx, data] of licenseIndex) {
		i++;
		if (!process.env.CI) {
			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			process.stdout.write(
				`                ${pkg}: ${spdx} (${i}/${licenseIndex.size})`
			);
		}

		data =
			data +
			[
				`Licensed under ${spdx}`,
				`Licensed using ${spdx}`,
				`Licensed with ${spdx}`,
				`Licenced under ${spdx}`,
				`Licenced using ${spdx}`,
				`Licenced with ${spdx}`,
				`${spdx} license`,
				`${spdx} license`,
				`${spdx} license`,
				`${spdx} licence`,
				`${spdx} licence`,
				`${spdx} licence`,
				`The ${spdx} license`,
				`The ${spdx} license`,
				`The ${spdx} license`,
				`The ${spdx} licence`,
				`The ${spdx} licence`,
				`The ${spdx} licence`
			].join("\n\n");

		const detector = new Detector(spdx, data);
		matches.set(spdx, detector.detect(license));
	}

	const sortedMatches = Array.from(matches).sort(
		(a, b) => a[1] - b[1]
	);
	const rawSPDXMatches = sortedMatches.map((m) => m[0]);

	let nearestMatch = rawSPDXMatches[0];

	if (knownSPDXLicense) {
		const distance = levenshtein(knownSPDXLicense, nearestMatch);

		if (distance >= LICENSE_SPDX_ACCREDIT_THRESHOLD) {
			nearestMatch = `${knownSPDXLicense}`;
		}
	}

	if (nearestMatch)
		if (!process.env.CI) {
			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			process.stdout.write(
				`                ${pkg}: ${nearestMatch}\n`
			);
		} else {
			console.log(`                ${pkg}: ${nearestMatch}`);
		}

	licenseCache.set(`${service}--${pkg}@${ver}`, nearestMatch);

	return nearestMatch;
};
