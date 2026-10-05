/**
 * The version of the application, read from package.json at build time.
 *
 * About used to want a version number and had none, which is how a settings page
 * ends up claiming to be "Version 1.0.0" when nobody knows. Importing the real
 * one means it can never drift from what was actually deployed.
 */
import { version } from "../package.json";

export const APP_VERSION = version;