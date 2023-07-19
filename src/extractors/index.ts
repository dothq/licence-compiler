/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { glob } from "glob";
import { join } from "path";

export class Extractor {
    LICENSE_PATTERN = "**/LICENSE"

    outDir = ""

    public constructor() {}

    public async locate() {
        const matches = await glob(join(this.outDir, this.LICENSE_PATTERN));

        return matches;
    }
}