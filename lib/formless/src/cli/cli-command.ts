import {
  parseInstanceWorkspaceTargetAlias,
  type WorkspaceOperationKind,
} from "@dpeek/formless-workspace";

import type { PushFormlessInstanceWorkspaceInput } from "./instance-workspace-deployment.ts";
import type { PullFormlessInstanceWorkspaceInput } from "./instance-workspace-source-sync.ts";

export type FormlessCliCommand =
  | { kind: "help" }
  | {
      confirm: string;
      kind: "workspaceDestroy";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      kind: "workspaceDev";
      open: boolean;
      reset: boolean;
      resetAuth: boolean;
      workspacePath: string | null;
    }
  | {
      adminToken: string | null;
      kind: "workspaceOwnerSetup";
      open: boolean;
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      dryRun: boolean;
      kind: "workspacePull";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      dryRun: boolean;
      force: boolean;
      kind: "workspacePush";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      adminToken: string | null;
      kind: "workspaceTokenAdopt";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      adminToken: string | null;
      kind: "workspaceTokenRotate";
      targetAlias: string | null;
      workspacePath: string | null;
    };

type FormlessCliWorkspaceOperationOptionField =
  | "dryRun"
  | "force"
  | "targetAlias"
  | "workspacePath";

type FormlessCliWorkspaceOperationOptionBinding = {
  fieldKey: FormlessCliWorkspaceOperationOptionField;
  optionName: string;
  syntax: string;
};

type FormlessCliParsedWorkspacePullCommand = Extract<FormlessCliCommand, { kind: "workspacePull" }>;

type FormlessCliParsedWorkspacePushCommand = Extract<FormlessCliCommand, { kind: "workspacePush" }>;

type FormlessCliWorkspaceOperationBindingBase = {
  command: string;
  dispatchKind: Extract<FormlessCliCommand["kind"], "workspacePull" | "workspacePush">;
  operationKind: Extract<WorkspaceOperationKind, "pull" | "push">;
  options: readonly FormlessCliWorkspaceOperationOptionBinding[];
  terminalDescription: string;
  terminalLabel: string;
};

type FormlessCliWorkspaceOperationBindingContract =
  | (FormlessCliWorkspaceOperationBindingBase & {
      defaults: Omit<FormlessCliParsedWorkspacePullCommand, "kind">;
      dispatchKind: "workspacePull";
      operationKind: "pull";
      translateInput: (
        command: FormlessCliParsedWorkspacePullCommand,
      ) => PullFormlessInstanceWorkspaceInput;
    })
  | (FormlessCliWorkspaceOperationBindingBase & {
      defaults: Omit<FormlessCliParsedWorkspacePushCommand, "kind">;
      dispatchKind: "workspacePush";
      operationKind: "push";
      translateInput: (
        command: FormlessCliParsedWorkspacePushCommand,
      ) => PushFormlessInstanceWorkspaceInput;
    });

export const FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS = [
  {
    command: "formless pull",
    defaults: {
      dryRun: false,
      targetAlias: null,
      workspacePath: null,
    },
    dispatchKind: "workspacePull",
    operationKind: "pull",
    options: [
      { fieldKey: "workspacePath", optionName: "--workspace", syntax: "[--workspace <path>]" },
      { fieldKey: "targetAlias", optionName: "--target", syntax: "[--target <alias>]" },
      { fieldKey: "dryRun", optionName: "--dry-run", syntax: "[--dry-run]" },
    ],
    terminalDescription: "Workspace source pull",
    terminalLabel: "pull",
    translateInput: (command) => ({
      dryRun: command.dryRun,
      targetAlias: command.targetAlias,
      ...(command.workspacePath === null ? {} : { workspacePath: command.workspacePath }),
    }),
  },
  {
    command: "formless push",
    defaults: {
      dryRun: false,
      force: false,
      targetAlias: null,
      workspacePath: null,
    },
    dispatchKind: "workspacePush",
    operationKind: "push",
    options: [
      { fieldKey: "workspacePath", optionName: "--workspace", syntax: "[--workspace <path>]" },
      { fieldKey: "targetAlias", optionName: "--target", syntax: "[--target <alias>]" },
      { fieldKey: "dryRun", optionName: "--dry-run", syntax: "[--dry-run]" },
      { fieldKey: "force", optionName: "--force", syntax: "[--force]" },
    ],
    terminalDescription: "Workspace source push",
    terminalLabel: "push",
    translateInput: (command) => ({
      apply: !command.dryRun,
      ...(command.force ? { force: true } : {}),
      targetAlias: command.targetAlias,
      ...(command.workspacePath === null ? {} : { workspacePath: command.workspacePath }),
    }),
  },
] as const satisfies readonly FormlessCliWorkspaceOperationBindingContract[];

export type FormlessCliWorkspaceOperationBinding =
  (typeof FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS)[number];

export type FormlessCliWorkspaceOperationCommandName =
  FormlessCliWorkspaceOperationBinding["command"];

export type FormlessCliWorkspaceOperationKind =
  FormlessCliWorkspaceOperationBinding["operationKind"];

const formlessCliWorkspaceOperationBindingsByKind = new Map<
  FormlessCliWorkspaceOperationKind,
  FormlessCliWorkspaceOperationBinding
>(FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => [binding.operationKind, binding]));

const formlessCliWorkspaceOperationBindingsByCommand = new Map<
  FormlessCliWorkspaceOperationCommandName,
  FormlessCliWorkspaceOperationBinding
>(FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => [binding.command, binding]));

export function formlessCliUsage(): string {
  return [
    "Usage: formless <command>",
    "",
    "Commands:",
    "  dev [--workspace <path>] [--open] [--reset] [--reset-auth]",
    "                                      Run local workspace and print browser session URL",
    ...workspaceCliOperationUsageLines(),
    "  destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
    "  owner setup [--workspace <path>] [--target <alias>]",
    "       [--open] [--admin-token <token>]",
    "  token <adopt|rotate> [--workspace <path>] [--target <alias>]",
    "       [--admin-token <token>]",
  ].join("\n");
}

export function parseFormlessCliArgs(args: string[]): FormlessCliCommand {
  const [command, ...rest] = args;

  if (!command || command === "-h" || command === "--help" || command === "help") {
    return { kind: "help" };
  }

  const workspaceOperationBinding = formlessCliWorkspaceOperationBindingForTopLevelCommand(command);
  if (workspaceOperationBinding) {
    return parseWorkspaceCliOperationArgs(workspaceOperationBinding, rest);
  }

  switch (command) {
    case "dev":
      return parseWorkspaceDevArgs(rest);
    case "destroy":
      return parseWorkspaceDestroyArgs(rest);
    case "owner":
      return parseWorkspaceOwnerArgs(rest);
    case "token":
      return parseWorkspaceTokenArgs(rest);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Source URL is invalid: ${value}`);
  }
}

function workspaceCliOperationUsageLines(): string[] {
  return FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.flatMap((binding) => [
    `  ${workspaceCliOperationUsage(binding)}`,
    `                                      ${binding.terminalDescription}`,
  ]);
}

export function formlessCliWorkspaceOperationCommandNameForKind(
  kind: FormlessCliWorkspaceOperationKind,
): FormlessCliWorkspaceOperationCommandName {
  return formlessCliWorkspaceOperationBindingForKind(kind).command;
}

export function formlessCliWorkspaceOperationBindingForKind<
  TKind extends FormlessCliWorkspaceOperationKind,
>(kind: TKind): Extract<FormlessCliWorkspaceOperationBinding, { operationKind: TKind }> {
  const binding = formlessCliWorkspaceOperationBindingsByKind.get(kind);

  if (!binding) {
    throw new Error(`Workspace operation "${kind}" is not bound to a Formless CLI command.`);
  }

  return binding as Extract<FormlessCliWorkspaceOperationBinding, { operationKind: TKind }>;
}

export function formlessCliWorkspaceOperationBindingForCommand(
  command: string,
): FormlessCliWorkspaceOperationBinding {
  const binding = formlessCliWorkspaceOperationBindingsByCommand.get(
    command as FormlessCliWorkspaceOperationCommandName,
  );

  if (!binding) {
    throw new Error(`Formless CLI command "${command}" is not bound to a workspace operation.`);
  }

  return binding;
}

function workspaceCliOperationUsage(binding: FormlessCliWorkspaceOperationBinding): string {
  return [binding.terminalLabel, ...workspaceCliOperationOptionSyntax(binding)].join(" ");
}

function workspaceCliOperationOptionSyntax(
  binding: FormlessCliWorkspaceOperationBinding,
): string[] {
  return binding.options.map((option) => option.syntax);
}

function formlessCliWorkspaceOperationBindingForTopLevelCommand(
  command: string,
): FormlessCliWorkspaceOperationBinding | undefined {
  return FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.find(
    (binding) => workspaceCliTopLevelCommand(binding.command) === command,
  );
}

function parseWorkspaceCliOperationArgs(
  binding: FormlessCliWorkspaceOperationBinding,
  args: string[],
): FormlessCliCommand {
  const operationKind: string = binding.operationKind;

  switch (binding.operationKind) {
    case "pull":
      return parseWorkspaceSourceSyncCliOperationArgs(binding, args, "workspacePull");
    case "push":
      return parseWorkspaceSourceSyncCliOperationArgs(binding, args, "workspacePush");
    default:
      throw new Error(`Workspace CLI operation "${operationKind}" is not supported.`);
  }
}

function parseWorkspaceSourceSyncCliOperationArgs<TKind extends "workspacePull" | "workspacePush">(
  binding: FormlessCliWorkspaceOperationBinding,
  args: string[],
  kind: TKind,
): Extract<FormlessCliCommand, { kind: TKind }> {
  const commandName = binding.command;
  const usage = workspaceCliOperationUsage(binding);
  const allowed = new Set<string>(binding.options.map((option) => option.fieldKey));
  let dryRun: boolean = binding.defaults.dryRun;
  let force: boolean = "force" in binding.defaults ? binding.defaults.force : false;
  let targetAlias: string | null = binding.defaults.targetAlias;
  let workspacePath: string | null = binding.defaults.workspacePath;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage}`);
    }

    if (arg === "--workspace" && allowed.has("workspacePath")) {
      workspacePath = readOptionValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--target" && allowed.has("targetAlias")) {
      targetAlias = parseCliTargetAlias(readOptionValue(args, index, "--target"));
      index += 1;
      continue;
    }

    if (arg === "--dry-run" && allowed.has("dryRun")) {
      dryRun = true;
      continue;
    }

    if (arg === "--force" && allowed.has("force")) {
      force = true;
      continue;
    }

    throw new Error(`Unknown option for ${commandName}: ${arg}`);
  }

  return {
    dryRun,
    ...(allowed.has("force") ? { force } : {}),
    kind,
    targetAlias,
    workspacePath,
  } as Extract<FormlessCliCommand, { kind: TKind }>;
}

function workspaceCliTopLevelCommand(command: FormlessCliWorkspaceOperationCommandName): string {
  const prefix = "formless ";

  if (!command.startsWith(prefix)) {
    throw new Error(`Formless CLI command "${command}" must start with "formless ".`);
  }

  const topLevelCommand = command.slice(prefix.length);

  if (!topLevelCommand || topLevelCommand.includes(" ")) {
    throw new Error(`Formless CLI command "${command}" must be a top-level command.`);
  }

  return topLevelCommand;
}

function parseWorkspaceDevArgs(args: string[]): FormlessCliCommand {
  const usage = "formless dev [--workspace <path>] [--open] [--reset] [--reset-auth]";
  const options = parseTopLevelWorkspaceOptions(args, usage);
  let open = false;
  let reset = false;
  let resetAuth = false;

  for (const arg of options.rest) {
    if (arg === "--open") {
      open = true;
      continue;
    }

    if (arg === "--reset") {
      reset = true;
      continue;
    }

    if (arg === "--reset-auth") {
      reset = true;
      resetAuth = true;
      continue;
    }

    throw new Error(`Unknown option for formless dev: ${arg}`);
  }

  return { kind: "workspaceDev", open, reset, resetAuth, workspacePath: options.workspacePath };
}

function parseWorkspaceDestroyArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(
    args,
    "formless destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
  );
  const confirm = parseRequiredConfirmOption(options.rest, "formless destroy");

  return {
    confirm,
    kind: "workspaceDestroy",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseWorkspaceTokenArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "adopt":
      return parseWorkspaceTokenCommandArgs(rest, "formless token adopt", "workspaceTokenAdopt");
    case "rotate":
      return parseWorkspaceTokenCommandArgs(rest, "formless token rotate", "workspaceTokenRotate");
    default:
      throw new Error("Usage: formless token <adopt|rotate>");
  }
}

function parseWorkspaceTokenCommandArgs<
  TKind extends "workspaceTokenAdopt" | "workspaceTokenRotate",
>(args: string[], usage: string, kind: TKind): Extract<FormlessCliCommand, { kind: TKind }> {
  const options = parseTopLevelTargetOptions(args, usage);
  let adminToken: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for ${usage}: ${arg}`);
  }

  return {
    adminToken,
    kind,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  } as Extract<FormlessCliCommand, { kind: TKind }>;
}

function parseWorkspaceOwnerArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "setup":
      return parseWorkspaceOwnerSetupArgs(rest);
    default:
      throw new Error("Usage: formless owner <setup>");
  }
}

function parseWorkspaceOwnerSetupArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(args, "formless owner setup");
  let adminToken: string | null = null;
  let open = false;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    if (arg === "--open") {
      open = true;
      continue;
    }

    throw new Error(`Unknown option for formless owner setup: ${arg}`);
  }

  return {
    adminToken,
    kind: "workspaceOwnerSetup",
    open,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseRequiredConfirmOption(args: string[], usage: string): string {
  let confirm: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--confirm") {
      confirm = readOptionValue(args, index, "--confirm");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for ${usage}: ${arg}`);
  }

  if (!confirm) {
    throw new Error(`Missing required option for ${usage}: --confirm.`);
  }

  return confirm;
}

function parseTopLevelTargetOptions(
  args: string[],
  usage: string,
): { rest: string[]; targetAlias: string | null; workspacePath: string | null } {
  const options = parseTopLevelWorkspaceOptions(args, usage);
  let targetAlias: string | null = null;
  const rest: string[] = [];

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--target") {
      targetAlias = parseCliTargetAlias(readOptionValue(options.rest, index, "--target"));
      index += 1;
      continue;
    }

    rest.push(arg);
  }

  return { rest, targetAlias, workspacePath: options.workspacePath };
}

function parseTopLevelWorkspaceOptions(
  args: string[],
  usage: string,
): { rest: string[]; workspacePath: string | null } {
  let workspacePath: string | null = null;
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = readOptionValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage}`);
    }

    rest.push(arg);
  }

  return { rest, workspacePath };
}

function parseCliTargetAlias(value: string): string {
  return parseInstanceWorkspaceTargetAlias("Formless instance workspace target alias", value);
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}
