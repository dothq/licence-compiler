/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import { readFile } from "fs/promises";
import { join } from "path";
import { maxSatisfying } from "semver";
import toml, { parse } from "toml";
import { DependencyService, RemoteFile } from ".";
import { GitExtractor } from "../extractors/git";
import { TarGZipExtractor } from "../extractors/tar-gzip";

export class CargoService extends DependencyService {
	public compile(
		licenseIndex: Map<string, string>,
		treeSha: string
	) {
		return super.compile(licenseIndex, treeSha, "**/Cargo.toml");
	}

	private async _lookupPackage(
		registryURI: string,
		dep: string,
		ver: string
	) {
		let extractor;
		let cargoToml;

		if (ver.startsWith("git:")) {
			const [repoURI, ref] = ver.split("git:")[1].split("#");

			extractor = await GitExtractor.fetch(repoURI, ref);

			const cargoTomlMatches = await extractor.getFile(
				"Cargo.toml"
			);

			if (cargoTomlMatches[0]) {
				const data = await readFile(
					cargoTomlMatches[0],
					"utf-8"
				);

				cargoToml = toml.parse(data);
			}
		} else {
			const res = await axios.get(
				`${registryURI}/api/v1/crates/${dep}/versions`
			);
			if (!res.data.versions) {
				console.warn(
					`No available versions for '${dep}@${ver}', skipping...`
				);
				return [null, null];
			}

			const allVersions = res.data.versions.map(
				(p: any) => p.num
			);
			const maxVersion = maxSatisfying(allVersions, ver);

			if (
				!maxVersion ||
				!res.data.versions.find(
					(p: any) => p.num == maxVersion
				)
			) {
				console.warn(
					`No available versions for '${dep}@${ver}', skipping...`
				);
				return [null, null];
			}

			const versionedPackage = res.data.versions.find(
				(p: any) => p.num == maxVersion
			);

			const downloadTarballURI = join(
				registryURI,
				versionedPackage.dl_path
			);

			const tarballURI = await axios.get(downloadTarballURI);

			extractor = await TarGZipExtractor.download(
				tarballURI.data.url,
				"gzip"
			);
			cargoToml = versionedPackage;
		}

		return [extractor, cargoToml];
	}

	public async getKnownSPDXLicense(dep: {
		name: string;
		version: string;
	}) {
		for await (const uri of (
			process.env.CRATES_REGISTRY_URLS || ""
		).split(",")) {
			if (!uri || !uri.length) {
				throw new Error("No Crates registry URLs provided.");
			}

			const [_, cargoToml] = await this._lookupPackage(
				uri,
				dep.name,
				dep.version
			);

			if (
				cargoToml &&
				cargoToml.license &&
				typeof cargoToml.license == "string"
			) {
				return cargoToml.license;
			}
		}

		return null;
	}

	private async processDependencies(
		dependencies: Record<string, string | any>,
		isDev?: boolean
	) {
		let licenses: Map<string, string[]> = new Map();

		for await (const [dep, data] of Object.entries(
			dependencies
		)) {
			let version = "";

			if (typeof data == "string") {
				version = data;
			} else if (typeof data == "object") {
				if (data.git) {
					version = `git:${data.git}#${
						data.branch || data.rev
					}`;
				} else if (data.version) {
					version = data.version;
				}
			}

			if (!version) {
				console.error(
					`Unable to parse version for crate '${dep}', skipping...`
				);
				continue;
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

		return licenses;
	}
}
