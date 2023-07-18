/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { config } from "dotenv";
import { Octokit } from "octokit";
import { NodeCompiler } from "./compilers/node";
import { CargoCompiler } from "./compilers/cargo";

config();

const compilers = [
	NodeCompiler,
	CargoCompiler,
]

const main = async () => {
	if (!process.env.GH_TOKEN)
		throw new Error("No GH_TOKEN provided");

	if (!process.env.GH_ORG) throw new Error("No GH_ORG provided");

	const octokit = new Octokit({ auth: process.env.GH_TOKEN });

	const repos = await octokit.request("GET /orgs/{org}/repos", {
		org: process.env.GH_ORG as string
	});

	for (const repo of repos.data) {
		console.log(`${repo.full_name} - Running...`);

		for (const compiler of compilers) {
			console.log(`    ${compiler.name}...`);

			const Compiler = new compiler(
				octokit, 
				repo.owner.login, 
				repo.name
			);

			try {
				await Compiler.compile(repo.default_branch || "main");
			} catch(e: any) {
				console.error(`${repo.full_name}: Failed to compile licenses for this project!`, e.stack);
				process.exit(1);
			}
		}
	}
};

main();
