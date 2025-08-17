import { ProjectOptions } from "ts-morph";

export type Service = { name: string; url: string; outDir: string };

export interface Config {
  services: Service[];
  tsMorphConfig: ProjectOptions;
}
