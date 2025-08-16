import { execSync } from "child_process";
import path from "path";

const generate = (name: string, url: string, outDir: string) => {
  const outPath = path.resolve(process.cwd(), outDir, "axios");

  execSync(
    `npx @openapitools/openapi-generator-cli generate -i ${url}/v3/api-docs -g typescript-axios -o "${outPath}"`,
    { stdio: "inherit" },
  );
};

export default generate;
