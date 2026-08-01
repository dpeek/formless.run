import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { WorkerRuntimeRequestTopology } from "./routing.ts";

type ClientAssetEnv = {
  ASSETS?: Fetcher;
};

export async function handleClientAssetRequest(
  request: Request,
  env: ClientAssetEnv,
  options: { runtimeTopology?: WorkerRuntimeRequestTopology } = {},
): Promise<Response | undefined> {
  if (!env.ASSETS) {
    return undefined;
  }

  if (shouldServeRuntimeClientShellDocument(options.runtimeTopology)) {
    return handleClientShellDocumentRequest(request, env);
  }

  return env.ASSETS.fetch(request);
}

export async function handleClientShellDocumentRequest(
  request: Request,
  env: ClientAssetEnv,
): Promise<Response | undefined> {
  if (!env.ASSETS) {
    return responseWithoutBodyForHead(request, fallbackClientShellDocumentResponse());
  }

  const shellResponse = await env.ASSETS.fetch(
    clientShellAssetRequest(getEquivalentRequestForHead(request)),
  );

  if (!isHtmlResponse(shellResponse)) {
    return responseWithoutBodyForHead(request, shellResponse);
  }

  const response = htmlResponse(shellResponse, await shellResponse.text());

  return responseWithoutBodyForHead(request, response);
}

function shouldServeRuntimeClientShellDocument(
  runtimeTopology?: WorkerRuntimeRequestTopology,
): boolean {
  const instanceBrowserProfile =
    runtimeTopology?.profileKind === "instance" || runtimeTopology?.profileKind === "dev";

  return Boolean(
    instanceBrowserProfile &&
    runtimeTopology?.readMethod &&
    runtimeTopology.acceptsHtml &&
    !runtimeTopology.apiPath &&
    !runtimeTopology.staticAssetPath &&
    runtimeTopology.pathname === runtimeTopologyRoutes.accessRoute,
  );
}

function clientShellAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = runtimeTopologyRoutes.clientShellAssetPath;
  url.search = "";
  url.hash = "";

  return new Request(url, {
    headers: request.headers,
    method: "GET",
  });
}

function htmlResponse(response: Response, html: string): Response {
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.delete("Content-Length");

  return new Response(html, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function fallbackClientShellDocumentResponse(): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" sizes="any" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>formless</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").toLowerCase().includes("text/html");
}
