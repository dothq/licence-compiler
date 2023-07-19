/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import { getOctokit } from "./github";
import { minimatch } from "minimatch";

export const getLicenseFileFromSPDX = async (spdx: string) => {
	const octokit = getOctokit();

	const common = {
		owner: "spdx",
		repo: "license-list-data"
	};

	const trees = await octokit.request(
		"GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
		{
			...common,
			tree_sha: "main"
		}
	);

	const rawTextTree = trees.data.tree.find(
		(tree: any) => tree.path == "text"
	);
	if (!rawTextTree)
		throw new Error(
			"Unable to locate 'text' tree in spdx/license-list-data."
		);

	const textTree = await octokit.request(
		"GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
		{
			...common,
			tree_sha: rawTextTree.sha!
		}
	);

	let foundLicense = textTree.data.tree.find(
		(text) =>
			text.path?.toLowerCase() == `${spdx.toLowerCase()}.txt`
	);

	if (!foundLicense) {
		foundLicense = textTree.data.tree.find(
			(text) =>
				text.path?.toLowerCase() ==
				`${spdx.toLowerCase()}-only.txt`
		);

		if (!foundLicense)
			throw new Error(
				`No SPDX license with identifier '${spdx}'!`
			);
	}

	return `https://raw.githubusercontent.com/spdx/license-list-data/main/text/${foundLicense.path}`;
};
