/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Octokit } from "octokit";
import { minimatch } from "minimatch";
import axios from "axios";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { extractorOutDir } from "..";

export interface RemoteFile {
	path: string;
	mode: string;
	type: string;
	sha: string;
	size: number;
	url: string;
	data: Buffer;
}

export class DependencyService {
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

		const data = [];

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

			const licenses = await (this as any).process({
				...match,
				data: content
			}) as Map<string, string[]>;

			const repositoryDependencies = [];

			for (const [depWithVer, lics] of licenses) {
				const data: {
					dependency: {
						name: string;
						version: string;
					};
					licenses: { path: string; data: string }[]
				} = {
					dependency: {
						name: depWithVer.substring(0, depWithVer.lastIndexOf("@")),
						version: depWithVer.substring(depWithVer.lastIndexOf("@") + 1, depWithVer.length),
					},
					licenses: []
				};

				for (const license of lics) {
					const depLicense = {
						path: "",
						data: ""
					}
	
					// We need to fetch the license data
					if (license.startsWith("http")) {
						const res = await axios.get(license, { responseType: "arraybuffer" });
	
						depLicense.data = res.data.toString("utf-8");
						depLicense.path = "/";
					} else if (existsSync(license)) {
						// The license is already stored
						const raw = await readFile(license, "utf-8");
	
						depLicense.data = raw
							.split("\n")
							.map(ln => ln.trim())
							.join("\n")
							.trim();

						let relativePath = license
							.split(extractorOutDir)[1];

						if (relativePath.includes("/package/")) {
							relativePath = "/" + relativePath.split("/package/")[1];
						} else if (!relativePath.includes("/package/") && relativePath.includes(`/${data.dependency.name}/`)) {
							// Some packages will be structured like /tmp/license-compiler/fs-extra-5.1.0/fs-extra
							// Rather than /tmp/license-compiler/fs-extra-5.1.0/package
							// So account for that here

							relativePath = "/" + relativePath.split(`/${data.dependency.name}/`)[1];
						}

						depLicense.path = relativePath;
					} else {
						console.warn(`${this.owner}/${this.repo}: Unable to fetch license information for '${data.dependency.name}' at '${license}', skipping...`);
						continue;
					}

					data.licenses.push(depLicense);
				}

				repositoryDependencies.push(data);
			}

			data.push({
				repo_name: `${this.owner}/${this.repo}`,
				tree: treeSha,
				service: this.constructor.name,
				dependencies: repositoryDependencies,
			});
		}

		return data;
	}
}