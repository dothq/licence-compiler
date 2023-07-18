/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Octokit } from "octokit";
import { minimatch } from "minimatch";
import axios from "axios";

export interface RemoteFile {
	path: string;
	mode: string;
	type: string;
	sha: string;
	size: number;
	url: string;
	data: Buffer;
}

export class Compiler {
	constructor(
		public octokit: Octokit,
		public owner: string,
		public repo: string
	) {}

	public async compile(treeSha: string, filePathGlob: string) {
		const tree = await this.octokit.request(
			"GET /repos/{org}/{repo}/git/trees/{tree_sha}?recursive=1",
			{
				org: this.owner,
				repo: this.repo,
				tree_sha: treeSha,
			}
		);

		const files = tree.data.tree;
		const matches: RemoteFile[] = files.filter((f: RemoteFile) => minimatch(f.path, filePathGlob));

		for await(const match of matches) {
			if (!("process" in this)) {
				throw new Error(`${this.constructor.name} doesn't have a .process(file) method!`);
			}

			const fileRes = await this.octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
				owner: this.owner,
				repo: this.repo,
				path: match.path
			}) as any;

			if (fileRes.data.type !== "file" || !fileRes.data.content) {
				throw new Error(`Cannot request ${match.path}, is not a file!`);
			}

			const content = Buffer.from(
				fileRes.data.content,
				"base64"
			);

			await (this as any).process({
				...match,
				data: content
			});
		}
	}
}
