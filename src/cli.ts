#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { Config } from "./types.ts";
import generateAxios from "./generateAxios.js";
import generateTanstackQuery from "./generateTanstackQuery.js";

const program = new Command();

program
  .name("openapi-ts-generator")
  .description(
    "Generate Tanstack Query with axios from an OpenAPI spec using a JSON config",
  )
  .version("1.0.0");

program
  .command("generate")
  .description("Fetch OpenAPI spec and generate hooks")
  .requiredOption("-c, --config <file>", "Path to JSON config file")
  .action(async (options) => {
    try {
      const configPath = path.resolve(process.cwd(), options.config);
      const configRaw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configRaw);

      const { services, tsMorphConfig }: Config = config;

      if (!services) {
        throw new Error('Config file must include "services"');
      }
      for (const s of services) {
        generateAxios(s.name, s.url, s.outDir);
        generateTanstackQuery(s.url, s.outDir, tsMorphConfig);
      }

      console.log("Successfully generated");

      // Call your generation logic here, e.g. write files to outDir
    } catch (err) {
      console.error("Error:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);
