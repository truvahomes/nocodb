/**
 * Loads `.env` before anything else in the process.
 *
 * `Noco.ts` also calls `dotenv.config()`, but it does so in the module *body*.
 * ES imports are hoisted and evaluated before that body runs, so every module
 * `Noco.ts` pulls in has already been evaluated by then — and any of them that
 * reads `process.env` in a top-level initializer gets the pre-dotenv value.
 * Two did so silently:
 *
 *   - `~/utils/envs` -> `ncSiteUrl`, so `NC_SITE_URL` was ignored and the
 *     Google OAuth `callbackURL` fell back to the request host (the backend
 *     origin) instead of the configured site URL.
 *   - `~/app.config`  -> `auth.disableEmailAuth`, so `NC_DISABLE_EMAIL_AUTH`
 *     was ignored and email sign-in stayed enabled.
 *
 * Importing this module *first* in an entry point closes that window: the
 * import is evaluated before the sibling imports that read `process.env`.
 * It must stay dependency-free apart from dotenv — anything it pulls in would
 * itself be evaluated pre-dotenv, recreating the bug.
 *
 * Real environment variables already in `process.env` win: dotenv does not
 * override existing keys, so container/CI env still takes precedence over a
 * stray `.env`. Calling it twice is therefore harmless and idempotent.
 */
import dotenv from 'dotenv';

dotenv.config();
