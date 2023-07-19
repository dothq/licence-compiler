/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import { Extractor } from ".";
import { writeFile } from "fs-extra";
import { basename, parse, resolve } from "path";
import { arch, tmpdir } from "os";
import tar from "tar";
import { minimatch } from "minimatch";
import { ensureDir } from "fs-extra";
import { extractorOutDir } from "..";
import compressing from "compressing";

export class TarGZipExtractor extends Extractor {
    constructor(archivePath: string, outDir: string) {
        super();

        this.outDir = outDir;
    }

    public async extract(archivePath: string, outDir: string) {
        await compressing.tgz.uncompress(archivePath, outDir);
    }

    static async download(uri: string) {
        const outDir = resolve(
            extractorOutDir,
            parse(uri).name
        );

        await ensureDir(outDir);

        const archivePath = resolve(
            outDir, 
            `package${parse(uri).ext}`
        );

        await new Promise(async (res) => {
            const resp = await axios.get(uri, { responseType: "arraybuffer" });
            await writeFile(archivePath, resp.data);
            res(1);
        });

        const instance = new TarGZipExtractor(archivePath, outDir);
        await instance.extract(archivePath, outDir);

        return instance;
    }
}