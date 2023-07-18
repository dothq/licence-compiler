/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Compiler, RemoteFile } from ".";

export class NodeCompiler extends Compiler {
	public compile(treeSha: string) {
		return super.compile(treeSha, "**/package.json");
	}

	private async processDependencies(dependencies: Record<string, string>, isDev?: boolean) {
		for (const [dep, ver] of Object.entries(dependencies)) {
			console.log(dep, ver);
		}
	}

	public async process(file: RemoteFile) {
		const text = file.data.toString("utf-8");
		const json = JSON.parse(text);

		if (json.dependencies) {
			await this.processDependencies(json.dependencies);
		}

		if (json.devDependencies) {
			await this.processDependencies(json.devDependencies, true);
		}
	}
}
