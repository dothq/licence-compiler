/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import { readFile } from "fs/promises";
import { maxSatisfying } from "semver";
import { DependencyService, RemoteFile } from ".";
import { GitExtractor } from "../extractors/git";
import { TarGZipExtractor } from "../extractors/tar-gzip";
import { getLicenseFileFromSPDX } from "../utils/spdx";

enum NPMPrefixes {
	GitHub = "github"
}

const NPM_INSTALL_PREFIXES = [NPMPrefixes.GitHub];

export class NodeService extends DependencyService {
	public compile(treeSha: string) {
		return super.compile(treeSha, "**/package.json");
	}

	private async _lookupPackage(
		registryURI: string,
		pkg: string,
		version: string
	) {
		let extractor;
		let packageJson;

		if (
			NPM_INSTALL_PREFIXES.findIndex((p) =>
				version.startsWith(p + ":")
			) >= 0
		) {
			const prefix = version.split(":")[0];
			const value = version.split(`${prefix}:`)[1];

			switch (prefix) {
				case NPMPrefixes.GitHub:
					const [owner, repoWithRef] = value.split("/");

					const isTag = repoWithRef.includes("@");
					const isRef = repoWithRef.includes("#"); // either a branch name (#main) or a SHA (#a51956)

					const [repo, ref] = isTag
						? repoWithRef.split("@")
						: isRef
						? repoWithRef.split("#")
						: repoWithRef;

					extractor = await GitExtractor.fetch(
						`https://github.com/${owner}/${repo}.git`,
						ref
					);

					const pjsonMatches = await extractor.getFile(
						"./package.json"
					);

					if (pjsonMatches[0]) {
						const data = await readFile(
							pjsonMatches[0],
							"utf-8"
						);

						packageJson = JSON.parse(data);
					}

					break;
				default:
					console.warn(
						`Unsupported fetch prefix '${prefix}' for '${pkg}@${version}', skipping...`
					);
					return [null, null];
			}
		} else {
			const res = await axios.get(`${registryURI}/${pkg}`);
			if (!res.data.versions) {
				console.warn(
					`No available versions for '${pkg}@${version}', skipping...`
				);
				return [null, null];
			}

			const allVersions = Object.keys(res.data.versions);
			const maxVersion = maxSatisfying(allVersions, version);

			if (!maxVersion || !(maxVersion in res.data.versions)) {
				console.warn(
					`No available versions for '${pkg}@${version}', skipping...`
				);
				return [null, null];
			}

			const versionedPackage = res.data.versions[maxVersion];

			const downloadTarballURI = versionedPackage.dist.tarball;

			if (!downloadTarballURI) {
				console.warn(
					`No available tarball for '${pkg}@${version}', skipping...`
				);
				return [null, null];
			}

			extractor = await TarGZipExtractor.download(
				downloadTarballURI
			);
			packageJson = res.data;
			packageJson.version = maxVersion;
		}

		return [extractor, packageJson];
	}

	private async processDependencies(
		dependencies: Record<string, string>,
		isDev?: boolean
	) {
		let licenses: Map<string, string[]> = new Map();

		for await (const [dep, ver] of Object.entries(dependencies)) {
			try {
				for await (const uri of (
					process.env.NPM_REGISTRY_URLS || ""
				).split(",")) {
					if (!uri || !uri.length) {
						throw new Error(
							"No NPM registry URLs provided."
						);
					}

					console.log(
						`        ${dep}@${ver}${
							isDev ? " (dev)" : ""
						}`
					);

					const [extractor, packageJson] =
						await this._lookupPackage(uri, dep, ver);
					if (!extractor || !packageJson) continue;

					const licenseMatches = await extractor.locate();

					if (
						licenseMatches.length == 0 &&
						packageJson &&
						packageJson.license &&
						typeof packageJson.license == "string"
					) {
						const spdxLicense = packageJson.license;

						try {
							const licensePath =
								await getLicenseFileFromSPDX(
									spdxLicense
								);

							licenseMatches.push(licensePath);
						} catch (error) {
							licenseMatches.push(spdxLicense);
						}
					}

					licenses.set(
						`${dep}@${packageJson.version || ver}`,
						(
							licenses.get(
								`${dep}@${packageJson.version || ver}`
							) || []
						).concat(licenseMatches)
					);
				}
			} catch (e) {
				console.error(
					`Failed to obtain package information for '${dep}@${ver}'.`
				);
				throw e;
			}
		}

		return licenses;
	}

	public async process(file: RemoteFile) {
		const text = file.data.toString("utf-8");
		const json = JSON.parse(text);

		let licenses: Map<string, string[]> = new Map();

		if (json.dependencies) {
			const depsMap = await this.processDependencies(
				json.dependencies
			);

			licenses = new Map([...licenses, ...depsMap]);
		}

		if (json.devDependencies) {
			const devDepsMap = await this.processDependencies(
				json.devDependencies,
				true
			);

			licenses = new Map([...licenses, ...devDepsMap]);
		}

		return licenses;
	}
}
