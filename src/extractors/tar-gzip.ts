/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import compressing from "compressing";
import { existsSync } from "fs";
import { ensureDir, writeFile } from "fs-extra";
import { readdir, rename } from "fs/promises";
import { parse, resolve } from "path";
import { Extractor } from ".";
import { extractorOutDir } from "..";

export class TarGZipExtractor extends Extractor {
	constructor(archivePath: string, outDir: string) {
		super();

		this.outDir = outDir;
	}

	public async extract(archivePath: string, outDir: string) {
		const dirs = await readdir(outDir);
		await compressing.tgz.uncompress(archivePath, outDir);
		const newDirs = await readdir(outDir);

		// Rubbish way of getting the extract dir
		// Using intersection to find the new created dir
		const extractDir = newDirs.filter(
			(x) => dirs.indexOf(x) === -1
		)[0];

		if (
			extractDir !== "package" &&
			!existsSync(resolve(outDir, "package"))
		) {
			await rename(
				resolve(outDir, extractDir),
				resolve(outDir, "package")
			);
		}
	}

	static async download(uri: string) {
		const outDir = resolve(extractorOutDir, parse(uri).name);

		await ensureDir(outDir);

		const archivePath = resolve(
			outDir,
			`package${parse(uri).ext}`
		);

		await new Promise(async (res) => {
			const resp = await axios.get(uri, {
				responseType: "arraybuffer"
			});
			await writeFile(archivePath, resp.data);
			res(1);
		});

		const instance = new TarGZipExtractor(archivePath, outDir);
		await instance.extract(archivePath, outDir);

		return instance;
	}
}
