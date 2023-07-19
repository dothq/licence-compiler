/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import fs from "fs";
import { ensureDir } from "fs-extra";
import { glob } from "glob";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { join, resolve } from "path";
import { Extractor } from ".";
import { extractorOutDir } from "..";

const allowedNameChars = "abcdefghijklmnopqrstuvwxyz0123456789-";

export class GitExtractor extends Extractor {
	constructor(clonePath: string) {
		super();

		this.outDir = clonePath;
	}

	public async getFile(globPattern: string) {
		return await glob(join(this.outDir, globPattern));
	}

	static async fetch(gitUri: string, sha: string) {
		const allowedNameRegex = new RegExp(
			`[^${allowedNameChars}]`,
			"g"
		);

		const outPath = resolve(
			extractorOutDir,
			gitUri.replace(allowedNameRegex, "-")
		);

		const clonePath = resolve(outPath, "package");

		await ensureDir(outPath);

		await git.clone({
			fs,
			http,
			dir: clonePath,
			url: gitUri,
			singleBranch: true,
			depth: 1,
			ref: sha
		});

		return new GitExtractor(clonePath);
	}
}
