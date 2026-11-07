// Base URL of the designer server the browser suites talk to. Override it to test another worktree or port.
export const SERVER = process.env.METERS_DESIGNER_URL || "http://127.0.0.1:8890";
export const DESIGNER_URL = SERVER + "/designer/index.html";
