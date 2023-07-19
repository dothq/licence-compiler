/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Compiler, RemoteFile } from ".";
import { parse } from "toml";

export class CargoCompiler extends Compiler {
	public compile(treeSha: string) {
		return super.compile(treeSha, "**/Cargo.toml");
	}

	private async processDependencies(
		dependencies: Record<string, string>,
		isDev?: boolean
	) {
		for (const [dep, ver] of Object.entries(dependencies)) {
			console.log(dep, ver);
		}
	}

	public async process(file: RemoteFile) {
		const text = file.data.toString("utf-8");
		const toml = parse(text);

		if (toml.dependencies) {
			await this.processDependencies(toml.dependencies);
		}

		if (toml["dev-dependencies"]) {
			await this.processDependencies(toml.dependencies, true);
		}
	}
}
