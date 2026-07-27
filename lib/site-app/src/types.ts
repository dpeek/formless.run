export const SITE_APP_PUBLIC_CONTRACT_VERSION = 1;

export type FieldValue = string | boolean | number;
export type RecordValues = Record<string, FieldValue>;

export type StoredRecord = {
  id: string;
  entity: string;
  values: RecordValues;
  createdAt: string;
  deletedAt?: string;
};

export type SitePageTreeProjection = {
  tree: SitePageTree | null;
  meta: SiteTreeMeta;
};

export type SitePageTreeResponse = SitePageTree;

export type SitePageTree = {
  site?: SiteSettingsNode;
  page: SiteBlockNode;
  frame: SitePageFrame;
  meta: SiteTreeMeta;
  route?: SiteTreeRoute;
};

export type SiteSettingsNode = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  backgroundColor?: string;
  initialThemeMode?: "system" | "light" | "dark";
  themeSwitchable?: boolean;
};

export type SitePageFrame = {
  header?: SiteBlockNode;
  footer?: SiteBlockNode;
};

export type SiteMediaNode = {
  assetId: string;
  href: string;
  kind: "image";
};

export type SitePublicOperationChallengeNode = {
  kind: "turnstile";
  siteKey?: string;
};

export type SitePublicOperationTargetNode =
  | {
      kind: "schemaKey";
      schemaKey: string;
      apiRoutePrefix: `/${string}`;
    }
  | {
      kind: "appInstall";
      packageAppKey: string;
      installId: string;
      apiRoutePrefix: `/${string}`;
    };

export type SitePublicOperationInputFieldOptionNode = {
  value: string;
  label: string;
};

export type SitePublicOperationTextFormatNode = "email" | "phone";

export type SitePublicOperationInputFieldNode = {
  name: string;
  label: string;
  required: boolean;
  control: "text" | "longText" | "boolean" | "date" | "number" | "enum";
  format?: SitePublicOperationTextFormatNode;
  suggestions?: string[];
  options?: SitePublicOperationInputFieldOptionNode[];
};

export type SitePublicOperationNode = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
  target?: SitePublicOperationTargetNode;
  route: string;
  challenge: SitePublicOperationChallengeNode;
  fields?: SitePublicOperationInputFieldNode[];
};

export type SiteTreeRoute =
  | {
      kind: "page";
      slug: string;
    }
  | {
      kind: "post-index";
      slug: string;
      postCount: number;
    }
  | {
      kind: "post";
      slug: string;
    };

export type SiteTreeMeta = {
  slug: string;
  generatedAt: string;
  warnings: SiteTreeWarning[];
};

export type SiteBlockNode = {
  id: string;
  type: string;
  label: string;
  body?: string;
  operationName?: string;
  operationKey?: string;
  buttonLabel?: string;
  successLabel?: string;
  nameLabel?: string;
  emailLabel?: string;
  messageLabel?: string;
  href?: string;
  date?: string;
  icon?: string;
  color?: string;
  alignment?: string;
  media?: SiteMediaNode;
  width?: number;
  height?: number;
  placements: SitePlacementNode[];
  query?: {
    key: string;
    items: SiteBlockNode[];
  };
  publicOperation?: SitePublicOperationNode;
};

export type SitePlacementNode = {
  id: string;
  order: number;
  label?: string;
  slot?: string;
  block: SiteBlockNode;
};

export type SiteTreeWarning = {
  code: string;
  recordId: string;
  message: string;
};
