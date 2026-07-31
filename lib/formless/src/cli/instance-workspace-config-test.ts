import type { FormlessConfig } from "@dpeek/formless-workspace";

export function formatTestFormlessConfigModule(config: FormlessConfig): string {
  const authorConfig: FormlessConfig = {
    name: config.name,
    ...(config.state === undefined ? {} : { state: config.state }),
    ...(config.media === undefined ? {} : { media: config.media }),
    ...(config.local === undefined ? {} : { local: config.local }),
    ...(config.packages === undefined ? {} : { packages: config.packages }),
    ...(config.program === undefined ? {} : { program: config.program }),
    ...(config.runtime === undefined ? {} : { runtime: config.runtime }),
  };

  return `export default ${JSON.stringify(authorConfig, null, 2)};\n`;
}
