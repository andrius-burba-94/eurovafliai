/**
 * PM2 apps for Eurovafliai. Both are reloaded together by scripts/deploy.sh.
 *
 * PocketBase is deliberately NOT here — it runs under systemd
 * (deploy/systemd/eurovafliai-pb.service) so it survives a reboot independently
 * of the Node processes, and so a bad deploy of the web app cannot take the
 * database process down with it.
 *
 * ## Why `interpreter` is set explicitly
 *
 * The VPS runs Node 22 system-wide and eight other apps depend on that. This
 * repo pins Node 24 (`.nvmrc`, `engines`, and `engine-strict=true` in `.npmrc`,
 * which makes `npm ci` refuse rather than warn). Node 24 is installed for this
 * app alone via fnm, with the installer's shell hooks deliberately skipped, so
 * nothing about root's login shell or the PM2 daemon's own environment changed.
 *
 * That isolation only holds if we name the binary. Leaving `interpreter`
 * unset would run these two apps on whatever Node the PM2 daemon happens to
 * have — today 22, which cannot run this build.
 *
 * The path goes through fnm's `default` alias rather than a version directory,
 * so a patch bump of Node 24 does not silently break the deploy.
 */
const NODE_24 = "/root/.local/share/fnm/aliases/default/bin/node";

const APP_DIR = "/var/www/eurovafliai";

/**
 * Shared by both apps. Neither carries secrets: those live in the VPS `.env`,
 * which is mode 600 and never committed.
 *
 * ## Why `--env-file` is here
 *
 * PM2 does not read `.env`. Next.js loads it itself, so the web app survives
 * without this — but the worker is plain Node under tsx, and its first act is
 * `parseServerEnv(process.env)`, which threw on every one of the five required
 * variables and put the process straight into a restart loop the first time
 * this file was used.
 *
 * `--env-file-if-exists` rather than `--env-file`: when the file is genuinely
 * missing, the app's own schema error naming each absent variable is far more
 * useful than Node refusing to boot with an ENOENT.
 */
const common = {
  cwd: APP_DIR,
  interpreter: NODE_24,
  interpreter_args: `--env-file-if-exists=${APP_DIR}/.env`,
  env: { NODE_ENV: "production" },
  time: true,
  autorestart: true,
  // A crash loop should be visible as a stopped app, not as an infinite
  // restart that quietly burns the box.
  max_restarts: 10,
  restart_delay: 2000,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "eurovafliai-web",
      // `next start` by its real entry point rather than `npm start`: one
      // process instead of npm spawning a child, so PM2's signals reach Next
      // itself and a reload is graceful.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3007",
      // Bound to localhost by Nginx in front; see deploy/nginx/.
      max_memory_restart: "500M",
    },
    {
      ...common,
      name: "eurovafliai-worker",
      // Pick timers, autodraft and nightly stats. Today it is the Phase 0
      // heartbeat scaffold — the real loop lands in Phase 2.5. It is wired up
      // now so the two-app layout, the Node 24 interpreter and the reload path
      // are all proven by the first deploy rather than by the draft-night one.
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/worker/index.ts",
      max_memory_restart: "300M",
    },
  ],
};
