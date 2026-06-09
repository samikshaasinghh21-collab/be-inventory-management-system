import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, "../package.json");

const readPackageVersion = () => {
  try {
    const value = fs.readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(value);
    return String(pkg.version ?? "").trim();
  } catch {
    return "";
  }
};

const getGitVersion = () => {
  try {
    return execSync("git describe --tags --dirty --always --long", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

const formatFallbackVersion = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  const second = String(now.getUTCSeconds()).padStart(2, "0");
  return `${year}.${month}.${day}-${hour}${minute}${second}`;
};

const packageVersion = readPackageVersion();
const gitVersion = getGitVersion();

const version =
  gitVersion ||
  (packageVersion && packageVersion !== "0.0.0" ? packageVersion : `0.0.0+build.${formatFallbackVersion()}`);

export default version;
