import { execSync } from "child_process";
import path from "path";
import { createRequire } from "module";

const generateAxios = (name: string, url: string, outDir: string) => {
  const outPath = path.resolve(process.cwd(), outDir, "axios");
  const require = createRequire(import.meta.url);
  const generatorBin = require.resolve(
    "@openapitools/openapi-generator-cli/main.js",
  );

  execSync(
    `node "${generatorBin}" generate -i ${url}/v3/api-docs -g typescript-axios -o "${outPath}"`,
    { stdio: "inherit" },
  );
};

export default generateAxios;
