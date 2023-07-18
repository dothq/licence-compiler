/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Octokit } from "octokit";

export class Compiler {
	constructor(
		public octokit: Octokit,
		public owner: string,
		public repo: string
	) {}

	public async compile(treeSha: string, filePath: string) {
		const tree = await this.octokit.request(
			"GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
			{
				owner: this.owner,
				repo: this.repo,
				tree_sha: treeSha
			}
		);

		console.log(tree);
	}
}
