import {
  enqueueWorkspaceGatewayAutoSave,
  fetchWorkspaceGatewayStatus,
  workspaceGatewayBrowserConfig,
  type WorkspaceGatewayAutoSaveEnqueueInput,
  type WorkspaceGatewayConfig,
} from "@dpeek/formless-gateway/client";

export type LocalWorkspaceAutoSaveClient = {
  enqueue: (input: WorkspaceGatewayAutoSaveEnqueueInput) => Promise<unknown>;
};

export type LocalWorkspaceAutoSaveOptions = {
  autoSave?: false | LocalWorkspaceAutoSaveClient;
};

export type LocalWorkspaceAutoSaveWriteSource = WorkspaceGatewayAutoSaveEnqueueInput["source"];

export function createLocalWorkspaceAutoSaveClient(
  config: WorkspaceGatewayConfig,
  fetcher: typeof fetch = fetch,
): LocalWorkspaceAutoSaveClient {
  return {
    enqueue: async (input) => {
      const status = await fetchWorkspaceGatewayStatus({ config, fetcher });
      await enqueueWorkspaceGatewayAutoSave(input, {
        config,
        csrfToken: status?.csrfToken,
        fetcher,
      });
    },
  };
}

export async function enqueueLocalWorkspaceAutoSave(
  input: WorkspaceGatewayAutoSaveEnqueueInput,
  options: LocalWorkspaceAutoSaveOptions = {},
): Promise<void> {
  if (options.autoSave === false) {
    return;
  }

  try {
    if (options.autoSave) {
      await options.autoSave.enqueue(input);
      return;
    }

    const config = workspaceGatewayBrowserConfig();

    if (!config) {
      return;
    }

    await enqueueWithGatewayClient(input, config);
  } catch {
    // Committed browser writes must not fail because local auto-save is unavailable.
  }
}

async function enqueueWithGatewayClient(
  input: WorkspaceGatewayAutoSaveEnqueueInput,
  config: WorkspaceGatewayConfig,
): Promise<void> {
  await createLocalWorkspaceAutoSaveClient(config).enqueue(input);
}
