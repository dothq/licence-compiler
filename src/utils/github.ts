/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Octokit } from "octokit";

export const getOctokit = () => {
    if (!process.env.GH_TOKEN)
		throw new Error("No GH_TOKEN provided");

	const octokit = new Octokit({ auth: process.env.GH_TOKEN });

    return octokit;
}