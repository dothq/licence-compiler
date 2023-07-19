/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { glob } from "glob";
import { join } from "path";

export class Extractor {
	LICENSE_PATTERNS = ["**/LICENSE", "**/LICENSE.md"];

	outDir = "";

	public constructor() {}

	public async locate() {
		let matches: string[] = [];

		for (const PATTERN of this.LICENSE_PATTERNS) {
			matches = matches.concat(
				await glob(join(this.outDir, PATTERN))
			);
		}

		return matches;
	}
}
