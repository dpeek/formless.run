export const FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME = "FORMLESS_TURNSTILE_SITE_KEY";
export const FORMLESS_TURNSTILE_SITE_KEY_DEFINE_NAME = "__FORMLESS_TURNSTILE_SITE_KEY__";
export const FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME = "FORMLESS_TURNSTILE_SECRET_KEY";
export const FORMLESS_TURNSTILE_ALWAYS_PASS_SITE_KEY = "1x00000000000000000000AA";
export const FORMLESS_TURNSTILE_ALWAYS_PASS_SECRET_KEY = "1x0000000000000000000000000000000AA";

export type TurnstileRuntimeEnv = {
  FORMLESS_TURNSTILE_SITE_KEY?: string;
  FORMLESS_TURNSTILE_SECRET_KEY?: string;
};

export function turnstileSiteKeyFromEnv(env: TurnstileRuntimeEnv): string | undefined {
  return optionalEnvString(env.FORMLESS_TURNSTILE_SITE_KEY);
}

export function turnstileSecretKeyFromEnv(env: TurnstileRuntimeEnv): string | undefined {
  return optionalEnvString(env.FORMLESS_TURNSTILE_SECRET_KEY);
}

function optionalEnvString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
