/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import { Extractor } from ".";
import fs from "fs";
import { basename, parse, resolve, join } from "path";
import { tmpdir } from "os";
import tar from "tar";
import { minimatch } from "minimatch";
import { ensureDir } from "fs-extra";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { extractorOutDir } from "..";
import { glob } from "glob"; 

const allowedNameChars = "abcdefghijklmnopqrstuvwxyz0123456789-";

export class GitExtractor extends Extractor {
    constructor(clonePath: string) {
        super();

        this.outDir = clonePath;
    }

    public async getFile(globPattern: string) {
        return await glob(join(this.outDir, globPattern));
    }

    static async fetch(gitUri: string, sha: string) {
        const allowedNameRegex = new RegExp(`[^${allowedNameChars}]`, "g");

        const outPath = resolve(
            extractorOutDir,
            gitUri.replace(allowedNameRegex, "-")
        );

        const clonePath = resolve(
            outPath,
            "package"
        )

        await ensureDir(outPath);

        await git.clone({ 
            fs,
            http,
            dir: clonePath,
            url: gitUri,
            singleBranch: true,
            depth: 1,
            ref: sha
        });

        return new GitExtractor(clonePath);
    }
 }