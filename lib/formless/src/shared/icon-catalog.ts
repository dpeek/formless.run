import { mergeSchemaIconDefinitionsWithDefaults, type AppSchema } from "@dpeek/formless-schema";

const iconCatalogGroupDefinitions = [
  { key: "ui", label: "Interface" },
  { key: "social", label: "Social" },
  { key: "provider", label: "Providers" },
] as const;

export type IconCatalogGroupKey = (typeof iconCatalogGroupDefinitions)[number]["key"];

export type IconCatalogEntry = {
  group: IconCatalogGroupKey;
  key: string;
  label: string;
  searchTerms?: readonly string[];
  source: string;
};

export type IconCatalogGroup = {
  entries: readonly IconCatalogEntry[];
  key: IconCatalogGroupKey;
  label: string;
};

export type AppIconCatalogEntry = {
  group?: string;
  key: string;
  label: string;
  source: string;
};

const strokeSvgAttributes =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const uiIcon = (
  key: string,
  label: string,
  body: string,
  searchTerms?: readonly string[],
): IconCatalogEntry => ({
  group: "ui",
  key,
  label,
  searchTerms,
  source: `<svg ${strokeSvgAttributes}>${body}</svg>`,
});

const filledIconViewBox = (
  group: Exclude<IconCatalogGroupKey, "ui">,
  key: string,
  label: string,
  viewBox: string,
  body: string,
  searchTerms?: readonly string[],
): IconCatalogEntry => ({
  group,
  key,
  label,
  searchTerms,
  source: `<svg viewBox="${viewBox}" fill="currentColor">${body}</svg>`,
});

const filledIcon = (
  group: Exclude<IconCatalogGroupKey, "ui">,
  key: string,
  label: string,
  body: string,
  searchTerms?: readonly string[],
): IconCatalogEntry => filledIconViewBox(group, key, label, "0 0 24 24", body, searchTerms);

const priorityMarkerIcon = uiIcon(
  "priority-marker",
  "Priority marker",
  '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  ["flag"],
);

export const iconCatalogEntries = [
  uiIcon("add", "Add", '<path d="M12 5v14"/><path d="M5 12h14"/>'),
  uiIcon(
    "calendar",
    "Calendar",
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  ),
  uiIcon("confirm", "Confirm", '<path d="m5 12 5 5L20 7"/>', ["check"]),
  uiIcon("close", "Close", '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', ["dismiss", "x"]),
  uiIcon(
    "color-pick",
    "Color pick",
    '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3-3 3 3-3 3z"/>',
    ["pipette"],
  ),
  uiIcon(
    "copy",
    "Copy",
    '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ),
  uiIcon("disclosure", "Disclosure", '<path d="m9 18 6-6-6-6"/>', ["chevron right"]),
  uiIcon("disclosure-down", "Disclosure down", '<path d="m6 9 6 6 6-6"/>', ["chevron down"]),
  uiIcon(
    "drag-handle",
    "Drag handle",
    '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
    ["grip"],
  ),
  uiIcon("indeterminate", "Indeterminate", '<path d="M5 12h14"/>', ["minus"]),
  uiIcon("loading", "Loading", '<path d="M21 12a9 9 0 1 1-6.2-8.56"/>', ["spinner"]),
  uiIcon("menu", "Menu", '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>'),
  uiIcon("next", "Next", '<path d="m9 18 6-6-6-6"/>', ["chevron right"]),
  uiIcon("previous", "Previous", '<path d="m15 18-6-6 6-6"/>', ["chevron left"]),
  priorityMarkerIcon,
  uiIcon(
    "publish",
    "Publish",
    '<path d="M4.5 16.5c-1.33-1.33-1.33-3.5 0-4.83L12 4.17l7.5 7.5c1.33 1.33 1.33 3.5 0 4.83L12 24z"/><path d="M12 4v20"/><path d="M4.5 16.5H12"/><path d="M12 16.5h7.5"/>',
    ["rocket"],
  ),
  uiIcon("remove", "Remove", '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', ["delete"]),
  uiIcon("select", "Select", '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>', ["chevrons"]),
  uiIcon("select-down", "Select down", '<path d="m6 9 6 6 6-6"/>'),
  uiIcon("sort", "Sort", '<path d="m6 9 6 6 6-6"/>'),
  uiIcon("tree-disclosure", "Tree disclosure", '<path d="m9 18 6-6-6-6"/>'),
  uiIcon(
    "text-bold",
    "Bold",
    '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
  ),
  uiIcon(
    "text-bulleted-list",
    "Bulleted list",
    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  ),
  uiIcon("text-code", "Code", '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
  uiIcon(
    "text-heading-two",
    "Heading 2",
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-1-2-2-2s-2 .5-2 2"/>',
  ),
  uiIcon(
    "text-heading-three",
    "Heading 3",
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 10h4l-2.5 3H19a2 2 0 1 1 0 4h-2"/>',
  ),
  uiIcon(
    "text-italic",
    "Italic",
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  ),
  uiIcon(
    "text-link",
    "Link",
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  uiIcon(
    "text-numbered-list",
    "Numbered list",
    '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1-2-1"/>',
  ),
  uiIcon(
    "text-paragraph",
    "Paragraph",
    '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  ),
  uiIcon(
    "text-quote",
    "Quote",
    '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 2-1 3.5-4 4z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 2-1 3.5-4 4z"/>',
  ),
  uiIcon(
    "text-strikethrough",
    "Strikethrough",
    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/>',
  ),
  filledIcon(
    "social",
    "github",
    "GitHub",
    '<path d="M12 .5C5.65 .5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.95.58.11.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11.1 11.1 0 0 1 12 6.07c.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.04.78 2.1v3.12c0 .31.21.68.79.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>',
  ),
  filledIcon(
    "social",
    "linkedin",
    "LinkedIn",
    '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.86-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z"/>',
  ),
  filledIconViewBox(
    "social",
    "bluesky",
    "Bluesky",
    "0 0 24 24",
    '<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995-2.636-1.861-3.641-1.539-4.3-1.24C0.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364C23.622 9.419 24 4.457 24 3.769c0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>',
    ["bsky"],
  ),
  filledIcon(
    "social",
    "threads",
    "Threads",
    '<path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"/>',
    ["meta"],
  ),
  filledIconViewBox(
    "social",
    "mastodon",
    "Mastodon",
    "0 0 32 32",
    '<path d="M29.0581 11.1929c0-6.0742-3.9797-7.8545-3.9797-7.8545C23.0718 2.417 19.6262 2.0293 16.0466 2h-.0879c-3.5798.0293-7.023.417-9.0296 1.3384 0 0-3.98 1.7803-3.98 7.8545 0 1.3911-.0271 3.0537.0171 4.8174.1445 5.9404 1.0889 11.7945 6.5811 13.2481 2.5322.6704 4.7063.8105 6.4573.7144 3.1755-.1758 4.958-1.1333 4.958-1.1333l-.1047-2.3037c0 0-2.269.7153-4.8176.6284-2.5249-.0869-5.1902-.2725-5.5986-3.3726-.0378-.272-.0566-.563-.0566-.8691 0 0 2.4785.606 5.6196.75 1.9207.0879 3.7219-.1128 5.5515-.3311 3.5083-.4189 6.563-2.5806 6.9468-4.5557.605-3.1113.5552-7.5928.5551-7.5928zM24.3638 19.0186H21.45v-7.1382c0-1.5049-.6331-2.2686-1.8997-2.2686-1.4002 0-2.1018.9058-2.1018 2.6973v3.9077h-2.8967v-3.9077c0-1.7915-.7019-2.6973-2.1021-2.6973-1.2666 0-1.8997.7637-1.8997 2.2686v7.1382H7.6362v-7.3545c0-1.5029.3828-2.6978 1.1516-3.5811.7927-.8838 1.8308-1.3369 3.1196-1.3369 1.491 0 2.6204.5732 3.367 1.7192L16 9.6821l.7261-1.2168c.7463-1.146 1.8755-1.7192 3.3667-1.7192 1.2886 0 2.3267.4531 3.1196 1.3369.7686.8833 1.1514 2.0781 1.1514 3.5811z"/>',
  ),
  filledIcon(
    "social",
    "x",
    "X",
    '<path d="M13.91 10.47 21.35 2h-1.76l-6.46 7.35L7.98 2H2.03l7.8 11.1L2.03 22h1.76l6.82-7.77L16.02 22h5.95l-8.06-11.53Zm-2.41 2.75-.79-1.11L4.42 3.3h2.7l5.08 7.11.79 1.11 6.59 9.25h-2.7l-5.38-7.55Z"/>',
    ["twitter"],
  ),
  filledIconViewBox(
    "social",
    "facebook",
    "Facebook",
    "0 0 32 32",
    '<path d="M26.67 4H5.33A1.34 1.34 0 0 0 4 5.33v21.34A1.34 1.34 0 0 0 5.33 28h11.49v-9.28H13.7v-3.63h3.12v-2.67c0-3.1 1.89-4.79 4.67-4.79.93 0 1.86 0 2.79.14V11h-1.91c-1.51 0-1.8.72-1.8 1.77v2.31h3.6l-.47 3.63h-3.13V28h6.1A1.34 1.34 0 0 0 28 26.67V5.33A1.34 1.34 0 0 0 26.67 4z"/>',
  ),
  filledIconViewBox(
    "social",
    "instagram",
    "Instagram",
    "0 0 32 32",
    '<circle cx="22.4056" cy="9.5944" r="1.44"/><path d="M16 9.8378A6.1622 6.1622 0 1 0 22.1622 16 6.1622 6.1622 0 0 0 16 9.8378zM16 20a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><path d="M16 6.1622c3.2041 0 3.5837.0122 4.849.07a6.6418 6.6418 0 0 1 2.2283.4132 3.9748 3.9748 0 0 1 2.2774 2.2774 6.6418 6.6418 0 0 1 .4132 2.2283c.0577 1.2653.07 1.6449.07 4.849s-.0122 3.5837-.07 4.849a6.6418 6.6418 0 0 1-.4132 2.2283 3.9748 3.9748 0 0 1-2.2774 2.2774 6.6418 6.6418 0 0 1-2.2283.4132c-1.2652.0577-1.6446.07-4.849.07s-3.5838-.0122-4.849-.07a6.6418 6.6418 0 0 1-2.2283-.4132 3.9748 3.9748 0 0 1-2.2774-2.2774 6.6418 6.6418 0 0 1-.4132-2.2283c-.0577-1.2653-.07-1.6449-.07-4.849s.0122-3.5837.07-4.849a6.6418 6.6418 0 0 1 .4132-2.2283 3.9748 3.9748 0 0 1 2.2774-2.2775 6.6418 6.6418 0 0 1 2.2283-.4132c1.2653-.0577 1.6449-.07 4.849-.07M16 4c-3.259 0-3.6677.0138-4.9476.0722A8.8068 8.8068 0 0 0 8.14 4.63 6.1363 6.1363 0 0 0 4.63 8.14a8.8068 8.8068 0 0 0-.5578 2.9129C4.0138 12.3323 4 12.741 4 16s.0138 3.6677.0722 4.9476A8.8074 8.8074 0 0 0 4.63 23.8605a6.1363 6.1363 0 0 0 3.51 3.51 8.8068 8.8068 0 0 0 2.9129.5578C12.3323 27.9862 12.741 28 16 28s3.6677-.0138 4.9476-.0722a8.8074 8.8074 0 0 0 2.9129-.5578 6.1363 6.1363 0 0 0 3.51-3.51 8.8074 8.8074 0 0 0 .5578-2.9129C27.9862 19.6677 28 19.259 28 16s-.0138-3.6677-.0722-4.9476A8.8068 8.8068 0 0 0 27.37 8.14a6.1363 6.1363 0 0 0-3.51-3.5095 8.8074 8.8074 0 0 0-2.9129-.5578C19.6677 4.0138 19.259 4 16 4z"/>',
  ),
  filledIconViewBox(
    "social",
    "youtube",
    "YouTube",
    "0 0 32 32",
    '<path d="M29.41 9.26a3.5 3.5 0 0 0-2.47-2.47C24.76 6.2 16 6.2 16 6.2s-8.76 0-10.94.59a3.5 3.5 0 0 0-2.47 2.47A36.13 36.13 0 0 0 2 16a36.13 36.13 0 0 0 .59 6.74 3.5 3.5 0 0 0 2.47 2.47C7.24 25.8 16 25.8 16 25.8s8.76 0 10.94-.59a3.5 3.5 0 0 0 2.47-2.47A36.13 36.13 0 0 0 30 16a36.13 36.13 0 0 0-.59-6.74zM13.2 20.2v-8.4l7.27 4.2z"/>',
  ),
  filledIconViewBox(
    "social",
    "vimeo",
    "Vimeo",
    "0 0 24 24",
    '<path d="M23.9765 6.4168c-.105 2.338-1.739 5.5429-4.894 9.6088-3.2679 4.247-6.0258 6.3699-8.2898 6.3699-1.409 0-2.578-1.294-3.553-3.881l-1.9179-7.1138c-.719-2.584-1.488-3.878-2.312-3.878-.179 0-.806.378-1.8809 1.132L0 7.1967a315.06 315.06 0 0 0 3.501-3.1279c1.579-1.368 2.765-2.085 3.5539-2.159 1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.5069.5389 2.45 1.1309 3.674 1.7759 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.8679 3.434-5.7568 6.7619-5.6368 2.4729.06 3.6279 1.664 3.4799 4.8069z"/>',
  ),
  filledIconViewBox(
    "social",
    "gravatar",
    "Gravatar",
    "0 0 24 24",
    '<path d="M12 0c-1.326 0-2.4 1.074-2.4 2.4v8.4c0 1.324 1.074 2.398 2.4 2.398s2.4-1.074 2.4-2.398V5.21c2.795.99 4.799 3.654 4.799 6.789 0 3.975-3.225 7.199-7.199 7.199S4.801 15.975 4.801 12c0-1.989.805-3.789 2.108-5.091.938-.938.938-2.458 0-3.396s-2.458-.938-3.396 0C1.344 5.686 0 8.686 0 12c0 6.627 5.373 12 12 12s12-5.373 12-12S18.627 0 12 0"/>',
  ),
  filledIconViewBox(
    "social",
    "movember",
    "Movember",
    "0 0 404 404",
    '<path d="M392.972 228.085v-.759c-3.026-18.847 0 0-9.684-54.109-1.059-6.992-2.572-13.984-4.539-20.823v-.76c-.303-.456-.757-.608-1.211-.608-.908 0-1.513.608-1.664 1.52v.456c0 2.888-2.573 30.55-2.724 31.918-.303 4.864-1.513 9.575-3.48 13.983-1.665 1.52-4.388 3.8-7.717 6.688-1.211 1.064-2.572 2.128-3.934 3.344-1.211 1.216-2.875 1.823-4.691 1.823-1.664 0-3.177-.455-4.691-1.367l-15.585-11.248-12.105-9.119c-19.216-14.439-37.828-30.55-58.709-37.086-8.927-2.584-18.309-2.584-27.236 0-3.783 1.064-7.415 2.584-10.895 4.408-9.079 4.863-14.677 12.919-21.637 16.719h-1.06c-6.96-3.8-12.559-11.856-21.637-16.719-3.481-1.976-7.112-3.496-10.895-4.408-8.927-2.584-18.309-2.584-27.236 0-20.881 6.536-39.493 22.495-58.2554 37.086l-12.105 9.119h-.454l-16.0391 11.248c-1.3618.912-3.0262 1.367-4.6907 1.367-1.6644 0-3.3288-.759-4.6907-1.823l-3.7828-3.344c-3.4802-2.888-6.0525-5.168-7.7169-6.688-1.9671-4.408-3.1776-9.119-3.4802-13.983 0-1.368-2.5723-29.03-2.8749-31.918v-.456c-.1514-.912-.7566-1.52-1.6645-1.52-.4539 0-.9079.304-1.2105.608v.76c-1.9671 6.839-3.4802 13.831-4.5394 20.823C10 227.326 13.3289 208.631 10 227.326v.759c0 1.064.6053 2.128 1.6644 2.584 16.3418 7.296 32.6835 14.288 49.1766 21.279l3.9341 1.672c1.8158.456 3.6315.456 5.296 0 5.1446-.912 10.2892-2.432 15.5852-3.344 13.0128-3.496 26.3287-5.775 39.7947-6.535 10.441 0 20.882 0 31.322-.608 1.362-.152 2.724-.304 4.086-.76l38.736-16.719c.454-.152.907-.152 1.21 0h1.362l38.585 16.719c1.361.456 2.723.608 4.085.76 9.079 0 18.158.76 27.236.76h6.658c12.256 1.216 24.361 3.343 36.315 6.535 5.296.912 10.289 2.432 15.585 3.344 1.059.152 2.119.152 3.026 0 1.06.304 2.27.304 3.329 0 18.158-7.6 36.315-15.199 54.473-23.103 1.21-.456 1.664-1.52 1.513-2.584z"/>',
    ["moustache", "mustache"],
  ),
  filledIcon(
    "provider",
    "apple",
    "Apple",
    '<path d="M16.8 13.1c0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.7-3.1-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.9-1.1-2.9-3.8ZM14.7 6.8c.6-.8 1.1-1.8 1-2.8-1 .1-2.1.7-2.8 1.4-.6.7-1.1 1.7-1 2.7 1 0 2.1-.5 2.8-1.3Z"/>',
  ),
  filledIcon(
    "provider",
    "gitlab",
    "GitLab",
    '<path d="m12 22 3.68-11.33H8.32L12 22Z"/><path d="m12 22-7.5-5.45 3.82-5.88L12 22Z"/><path d="M4.5 16.55 2.75 11.2c-.18-.57.02-1.2.5-1.55.49-.36 1.16-.34 1.63.03l3.44.99-3.82 5.88Z"/><path d="m8.32 10.67 1.46-4.49c.22-.68 1.19-.68 1.41 0L12 8.67l-3.68 2Z"/><path d="m12 22 7.5-5.45-3.82-5.88L12 22Z"/><path d="m19.5 16.55 1.75-5.35c.18-.57-.02-1.2-.5-1.55-.49-.36-1.16-.34-1.63.03l-3.44.99 3.82 5.88Z"/><path d="m15.68 10.67-1.46-4.49c-.22-.68-1.19-.68-1.41 0L12 8.67l3.68 2Z"/>',
  ),
  filledIcon(
    "provider",
    "google",
    "Google",
    '<path d="M21.6 12.23c0-.74-.07-1.45-.19-2.12H12v4.01h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.99-4.31 2.99-7.42Z"/><path d="M12 22c2.7 0 4.96-.89 6.61-2.35l-3.22-2.51c-.9.6-2.04.95-3.39.95-2.61 0-4.82-1.76-5.61-4.12H3.06v2.59A9.99 9.99 0 0 0 12 22Z"/><path d="M6.39 13.97A6 6 0 0 1 6.08 12c0-.68.11-1.35.31-1.97V7.44H3.06A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.06 4.56l3.33-2.59Z"/><path d="M12 5.91c1.47 0 2.79.51 3.83 1.5l2.86-2.86C16.96 2.94 14.7 2 12 2a9.99 9.99 0 0 0-8.94 5.44l3.33 2.59C7.18 7.67 9.39 5.91 12 5.91Z"/>',
  ),
  filledIcon(
    "provider",
    "microsoft",
    "Microsoft",
    '<rect height="9" width="9" x="2" y="2"/><rect height="9" width="9" x="13" y="2"/><rect height="9" width="9" x="2" y="13"/><rect height="9" width="9" x="13" y="13"/>',
  ),
  filledIcon(
    "provider",
    "npm",
    "npm",
    '<path d="M2 7h20v10H12v-2H8v2H2V7Zm3 2v6h2V9H5Zm4 0v6h2V9H9Zm4 0v6h2V9h2v6h2V9h-6Z"/>',
  ),
] as const satisfies readonly IconCatalogEntry[];

export function listIconCatalogEntries(): readonly IconCatalogEntry[] {
  return iconCatalogEntries;
}

export function listIconCatalogGroups(): readonly IconCatalogGroup[] {
  return iconCatalogGroupDefinitions.map((group) => ({
    ...group,
    entries: iconCatalogEntries.filter((entry) => entry.group === group.key),
  }));
}

export function findIconCatalogEntry(key: string | undefined): IconCatalogEntry | undefined {
  if (!key) {
    return undefined;
  }

  return iconCatalogEntries.find((entry) => entry.key === normalizeIconCatalogKey(key));
}

export function resolveIconCatalogSvg(key: string | undefined): string | undefined {
  return findIconCatalogEntry(key)?.source;
}

export function listAppIconCatalogEntries(
  schema: Pick<AppSchema, "icons"> | null | undefined,
): readonly AppIconCatalogEntry[] {
  return mergeSchemaIconDefinitionsWithDefaults<AppIconCatalogEntry>(
    schema?.icons,
    iconCatalogEntries,
  );
}

export function findAppIconCatalogEntry(
  schema: Pick<AppSchema, "icons"> | null | undefined,
  key: string | undefined,
): AppIconCatalogEntry | undefined {
  if (!key) {
    return undefined;
  }

  return listAppIconCatalogEntries(schema).find((entry) => entry.key === key);
}

export function resolveAppIconCatalogSvg(
  schema: Pick<AppSchema, "icons"> | null | undefined,
  key: string | undefined,
): string | undefined {
  return findAppIconCatalogEntry(schema, key)?.source;
}

function normalizeIconCatalogKey(key: string): string {
  return key.trim().toLowerCase();
}
