/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { config } from "dotenv";
import { ensureDir } from "fs-extra";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { parse, resolve } from "path";
import { rimraf } from "rimraf";
import { CargoService } from "./services/cargo";
import { NodeService } from "./services/node";
import { getOctokit } from "./utils/github";

config();

const services = [NodeService, CargoService];

export const extractorOutDir = resolve(tmpdir(), "license-compiler");

const repoDepsOutDir = resolve(process.cwd(), "dep-data");

const main = async () => {
	const octokit = getOctokit();

	if (!process.env.GH_ORG) throw new Error("No GH_ORG provided");

	await rimraf(extractorOutDir);
	await ensureDir(extractorOutDir);

	await rimraf(repoDepsOutDir);
	await ensureDir(repoDepsOutDir);

	const repos = await octokit.request("GET /orgs/{org}/repos", {
		org: process.env.GH_ORG as string,
		type: "all"
	});

	const allowedRepos = repos.data.filter(
		(repo) => repo.visibility == "public"
	);

	const data: Record<string, any[]> = {};

	for (const repo of allowedRepos) {
		console.log(`${repo.full_name} - Running...`);

		data[repo.full_name] = [];

		for await (const service of services) {
			console.log(`    ${service.name}...`);

			const Service = new service(
				octokit,
				repo.owner.login,
				repo.name
			);

			try {
				const metadata = await Service.compile(
					repo.default_branch || "main"
				);

				data[repo.full_name] =
					data[repo.full_name].concat(metadata);
			} catch (e: any) {
				console.error(
					`${repo.full_name}: Failed to compile licenses for this project!`,
					e.stack
				);
			}
		}

		await ensureDir(
			resolve(repoDepsOutDir, `${parse(repo.full_name).dir}`)
		);

		await writeFile(
			resolve(repoDepsOutDir, `${repo.full_name}.json`),
			JSON.stringify(data[repo.full_name], null, 4)
		);
	}
};

main();
