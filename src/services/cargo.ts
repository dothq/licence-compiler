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
import { getLicenseFileFromSPDX } from "../utils/spdx";

export class CargoService extends DependencyService {
	public compile(treeSha: string) {
		return super.compile(treeSha, "**/Cargo.toml");
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

			if (!version)
				throw new Error(
					`Unable to parse version for crate '${dep}'.`
				);

			try {
				console.log(
					`            ${dep}@${version}${
						isDev ? " (dev)" : ""
					}`
				);

				for await (const uri of (
					process.env.CRATES_REGISTRY_URLS || ""
				).split(",")) {
					if (!uri || !uri.length) {
						throw new Error(
							"No Crates registry URLs provided."
						);
					}

					const [extractor, cargoToml] =
						await this._lookupPackage(uri, dep, version);
					if (!extractor || !cargoToml) continue;

					let licenseMatches = await extractor.locate();

					if (
						licenseMatches.length == 0 &&
						cargoToml &&
						cargoToml.license &&
						typeof cargoToml.license == "string"
					) {
						const spdxLicense = cargoToml.license;

						let licenses: string[] = [spdxLicense];

						if (spdxLicense.includes("/")) {
							licenses = spdxLicense.split("/");
						} else if (spdxLicense.includes(" or ")) {
							licenses = spdxLicense.split(" or ");
						} else if (spdxLicense.includes(" OR ")) {
							licenses = spdxLicense.split(" OR ");
						}

						const newLics = [];
						let pushedFullLicense = false;

						try {
							for (const spdxLic of licenses) {
								const licensePath =
									await getLicenseFileFromSPDX(
										spdxLic
									);

								newLics.push(licensePath);
							}
						} catch (error) {
							licenseMatches.push(spdxLicense);
							pushedFullLicense = true;
						}

						if (
							newLics.length &&
							pushedFullLicense == false
						) {
							licenseMatches =
								licenseMatches.concat(newLics);
						}
					}

					licenses.set(
						`${dep}@${cargoToml.version || version}`,
						(
							licenses.get(
								`${dep}@${
									cargoToml.version || version
								}`
							) || []
						).concat(licenseMatches)
					);
				}
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

		return licenses;
	}
}
