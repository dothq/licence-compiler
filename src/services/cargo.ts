/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { parse } from "toml";
import { DependencyService, RemoteFile } from ".";

export class CargoService extends DependencyService {
	public compile(treeSha: string) {
		return super.compile(treeSha, "**/Cargo.toml");
	}

	private async _lookupPackage(dep: string, ver: string) {
		return [null];
	}

	private async processDependencies(
		dependencies: Record<string, string | { version: string }>,
		isDev?: boolean
	) {
		let licenses: Map<string, string[]> = new Map();

		for await (const [dep, _ver] of Object.entries(
			dependencies
		)) {
			const version =
				typeof _ver == "string"
					? _ver
					: typeof _ver == "object"
					? _ver.version
					: null;

			if (!version)
				throw new Error(
					`Unable to parse version for crate '${dep}'.`
				);

			try {
				console.log(
					`        ${dep}@${version}${
						isDev ? " (dev)" : ""
					}`
				);

				const [extractor] = await this._lookupPackage(
					dep,
					version
				);
				if (!extractor) continue;

				licenses.set(
					`${dep}@${version}`,
					(licenses.get(`${dep}@${version}`) || []).concat(
						[]
					)
				);
			} catch (e) {
				console.error(
					`Failed to obtain package information for '${dep}@${version}'.`
				);
				throw e;
			}
		}

		return licenses;
	}

	public async process(file: RemoteFile) {
		const text = file.data.toString("utf-8");
		const toml = parse(text);

		let licenses: Map<string, string[]> = new Map();

		if (toml.dependencies) {
			const depsMap = await this.processDependencies(
				toml.dependencies
			);

			licenses = new Map([...licenses, ...depsMap]);
		}

		if (toml["dev-dependencies"]) {
			const devDepsMap = await this.processDependencies(
				toml["dev-dependencies"],
				true
			);

			licenses = new Map([...licenses, ...devDepsMap]);
		}
	}
}
