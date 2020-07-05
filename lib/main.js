"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const commit_analyzer_1 = require("@semantic-release/commit-analyzer");
const release_notes_generator_1 = require("@semantic-release/release-notes-generator");
const HASH_SEPARATOR = "|commit-hash:";
const SEPARATOR = "==============================================";
function exec(command) {
    return __awaiter(this, void 0, void 0, function* () {
        let stdout = "";
        let stderr = "";
        try {
            const options = {
                listeners: {
                    stdout: (data) => {
                        stdout += data.toString();
                    },
                    stderr: (data) => {
                        stderr += data.toString();
                    },
                },
            };
            const code = yield exec_1.exec(command, undefined, options);
            return {
                code,
                stdout,
                stderr,
            };
        }
        catch (err) {
            return {
                code: 1,
                stdout,
                stderr,
                error: err,
            };
        }
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const defaultBump = core.getInput("default_bump");
            const tag = core.getInput("tag") || '0.0.1';
            const releaseBranches = core.getInput("release_branches");
            const createAnnotatedTag = core.getInput("create_annotated_tag");
            const dryRun = core.getInput("dry_run");
            const { GITHUB_REF, GITHUB_SHA } = process.env;
            if (!GITHUB_REF) {
                core.setFailed("Missing GITHUB_REF");
                return;
            }
            if (!GITHUB_SHA) {
                core.setFailed("Missing GITHUB_SHA");
                return;
            }
            const preRelease = releaseBranches
                .split(",")
                .every((branch) => !GITHUB_REF.replace("refs/heads/", "").match(branch));
            yield exec("git fetch --tags");
            let logs = "";
            // for some reason the commits start and end with a `'` on the CI so we ignore it
            const commits = logs
                .split(SEPARATOR)
                .map((x) => {
                const data = x.trim().replace(/^'\n'/g, "").replace(/^'/g, "");
                if (!data) {
                    return {};
                }
                const [message, hash] = data.split(HASH_SEPARATOR);
                return {
                    message: message.trim(),
                    hash: hash.trim(),
                };
            })
                .filter((x) => !!x.message);
            const bump = yield commit_analyzer_1.analyzeCommits({}, { commits, logger: { log: console.info.bind(console) } });
            if (!bump && defaultBump === "false") {
                core.debug("No commit specifies the version bump. Skipping...");
                return;
            }
            const latestHash = (yield exec("git rev-parse HEAD")).stdout.trim();
            const newTag = `${tag}.${latestHash.slice(0, 6)}`;
            core.setOutput("latest_hash", latestHash);
            core.setOutput("new_tag", newTag);
            core.debug(`New tag: ${newTag}`);
            const changelog = yield release_notes_generator_1.generateNotes({}, {
                commits,
                logger: { log: console.info.bind(console) },
                options: {
                    repositoryUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}`,
                },
                lastRelease: { gitTag: tag },
                nextRelease: { gitTag: newTag, latestHash },
            });
            core.setOutput("changelog", changelog);
            if (preRelease) {
                core.debug("This branch is not a release branch. Skipping the tag creation.");
                return;
            }
            const tagAlreadyExists = !!(yield exec(`git tag -l "${newTag}"`)).stdout.trim();
            if (tagAlreadyExists) {
                core.debug("This tag already exists. Skipping the tag creation.");
                return;
            }
            if (/true/i.test(dryRun)) {
                core.info("Dry run: not performing tag action.");
                return;
            }
            const octokit = new github_1.GitHub(core.getInput("github_token"));
            if (createAnnotatedTag === "true") {
                core.debug(`Creating annotated tag`);
                const tagCreateResponse = yield octokit.git.createTag(Object.assign(Object.assign({}, github_1.context.repo), { tag: newTag, message: newTag, object: GITHUB_SHA, type: "commit" }));
                core.debug(`Pushing annotated tag to the repo`);
                yield octokit.git.createRef(Object.assign(Object.assign({}, github_1.context.repo), { ref: `refs/tags/${newTag}`, sha: tagCreateResponse.data.sha }));
                return;
            }
            core.debug(`Pushing new tag to the repo`);
            yield octokit.git.createRef(Object.assign(Object.assign({}, github_1.context.repo), { ref: `refs/tags/${newTag}`, sha: GITHUB_SHA }));
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
