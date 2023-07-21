/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { config } from "dotenv";
import { ensureDir } from "fs-extra";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { parse, resolve } from "path";
import * as rax from "retry-axios";
import { rimraf } from "rimraf";
import { fetchSPDXData } from "./detectors";
import { CargoService } from "./services/cargo";
import { NodeService } from "./services/node";
import { getOctokit } from "./utils/github";

config();

const services = [NodeService, CargoService];

export const extractorOutDir = resolve(tmpdir(), "license-compiler");

const repoDepsOutDir = resolve(process.cwd(), "dep-data");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
	rax.attach();

	const octokit = getOctokit();

	if (!process.env.GH_ORG) throw new Error("No GH_ORG provided");

	await rimraf(extractorOutDir);
	await ensureDir(extractorOutDir);

	await rimraf(repoDepsOutDir);
	await ensureDir(repoDepsOutDir);

	const repos = [];

	for await (const res of octokit.paginate.iterator(
		"GET /orgs/{org}/repos",
		{
			org: process.env.GH_ORG as string,
			sort: "updated",
			type: "all",
			per_page: 100
		}
	)) {
		for (const repo of res.data) {
			if (repo.visibility !== "public") continue;

			repos.push(repo);
		}
	}

	const data: Record<string, any[]> = {};

	console.log("Updating SPDX database definitions...");
	const licenseIndex = await fetchSPDXData();

	var i = 0;
	for (const repo of repos) {
		i++;
		console.log(
			`${repo.full_name} - Running... (${i}/${repos.length})`
		);

		data[repo.full_name] = [];

		console.log("    Jobs:");

		for await (const service of services) {
			console.log(`        ${service.name}...`);

			await sleep(1000);

			const Service = new service(
				octokit,
				repo.owner.login,
				repo.name
			);

			try {
				const metadata = await Service.compile(
					licenseIndex,
					repo.default_branch || "main"
				);

				data[repo.full_name] =
					data[repo.full_name].concat(metadata);
			} catch (e: any) {
				console.error(
					`${repo.full_name}: Failed to compile licenses for this project!`,
					e
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
