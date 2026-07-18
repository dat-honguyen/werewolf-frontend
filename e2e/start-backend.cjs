#!/usr/bin/env node
'use strict';

// Cross-platform stand-in for werewolf's `.claude/skills/run-werewolf/driver.sh up`, invoked by
// playwright.config.ts's webServer. On Linux/CI (where that script's shebang and tool assumptions
// -- `ss`, POSIX paths -- actually hold) it just delegates to the real driver.sh unchanged. On
// Windows it can't be used at all: Windows has no shell that executes a `.sh` file directly, and
// even under WSL the script's CRLF line endings (this repo is checked out on the Windows
// filesystem) break its shebang (`bash\r: No such file or directory`). So on Windows this ports
// driver.sh's `cmd_up` logic to Node directly instead of shelling out to it.
const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const WEREWOLF_ROOT = path.resolve(__dirname, '..', '..', 'werewolf');
const APP_DIR = path.join(WEREWOLF_ROOT, 'src', 'Application');
const PORT = process.env.PORT || '5080';
const BASE_URL = `http://localhost:${PORT}`;
const SKILL_DIR = path.join(WEREWOLF_ROOT, '.claude', 'skills', 'run-werewolf');
const LOG_FILE = path.join(SKILL_DIR, '.app.win.log');
const PID_FILE = path.join(SKILL_DIR, '.app.win.pid');

function run(cmd, args, opts = {}) {
    console.log(`== ${cmd} ${args.join(' ')} ==`);
    return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

async function isHealthy() {
    try {
        const res = await fetch(`${BASE_URL}/health/ready`);
        return res.ok;
    } catch {
        return false;
    }
}

async function waitForHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isHealthy()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
}

function runOnUnix() {
    const result = spawnSync('bash', ['.claude/skills/run-werewolf/driver.sh', 'up'], {
        cwd: WEREWOLF_ROOT,
        stdio: 'inherit'
    });
    process.exit(result.status ?? 1);
}

async function runOnWindows() {
    // Postgres runs inside podman's Linux VM on Windows -- unlike Linux CI, that VM isn't already
    // running, so `podman compose up` alone fails with a connection error until it's started.
    // `podman machine start` exits non-zero if it's already running; that's not a real failure.
    const machineStart = run('podman', ['machine', 'start']);
    if (machineStart.status !== 0) {
        console.log('podman machine start: already running, continuing');
    }

    run('podman', ['compose', 'up', '-d'], { cwd: WEREWOLF_ROOT });

    console.log('== build ==');
    const build = run('dotnet', ['build', path.join(APP_DIR, 'Application.csproj')]);
    if (build.status !== 0) {
        process.exit(build.status ?? 1);
    }

    if (await isHealthy()) {
        console.log(`already running: ${BASE_URL}`);
        return;
    }

    console.log('== launch (background) ==');
    fs.mkdirSync(SKILL_DIR, { recursive: true });
    const logFd = fs.openSync(LOG_FILE, 'w');
    const child = spawn('dotnet', ['run', '--no-launch-profile', '--urls', BASE_URL], {
        cwd: APP_DIR,
        env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development' },
        detached: true,
        stdio: ['ignore', logFd, logFd]
    });
    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid));

    console.log('== waiting for /health/ready ==');
    const ok = await waitForHealth(60_000);
    if (!ok) {
        console.error(`timed out waiting for health check; see ${LOG_FILE}`);
        try {
            console.error(fs.readFileSync(LOG_FILE, 'utf-8').split('\n').slice(-40).join('\n'));
        } catch {
            // log file may not exist yet if the process failed immediately
        }
        process.exit(1);
    }
    console.log(`up: ${BASE_URL} (pid ${child.pid}, log: ${LOG_FILE})`);
}

if (process.platform === 'win32') {
    runOnWindows().catch((err) => {
        console.error(err);
        process.exit(1);
    });
} else {
    runOnUnix();
}
