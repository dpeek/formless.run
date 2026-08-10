import { resolveIconCatalogSvg } from "../shared/icon-catalog.ts";
import type { StoredRecord } from "@dpeek/formless-storage";

const githubIconSource = requiredIconCatalogSvg("github");
const linkedInIconSource = requiredIconCatalogSvg("linkedin");

function requiredIconCatalogSvg(key: string): string {
  const source = resolveIconCatalogSvg(key);

  if (!source) {
    throw new Error(`Missing icon catalog entry "${key}".`);
  }

  return source;
}

export const testSiteRecords: StoredRecord[] = [
  {
    id: "rec_site_settings_primary",
    entity: "site",
    values: {
      key: "primary",
      label: "Example Site",
      description: "A public test site.",
      icon: "formless",
      initialThemeMode: "system",
      themeSwitchable: true,
      home: "rec_site_content_home",
      header: "rec_site_content_group_header",
      footer: "rec_site_content_group_footer",
    },
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  },
  block("rec_site_media_avatar", "2026-05-05T00:00:01.000Z", {
    type: "image",
    label: "Site owner portrait",
    href: "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 1200 1200%27%3E%3Crect width=%271200%27 height=%271200%27 fill=%27%230f766e%27/%3E%3Ctext x=%27600%27 y=%27620%27 font-size=%2796%27 text-anchor=%27middle%27 fill=%27white%27%3ESite owner%3C/text%3E%3C/svg%3E",
    width: 1200,
    height: 1200,
  }),
  block("rec_site_content_profile_intro", "2026-05-05T00:00:03.000Z", {
    type: "markdown",
    label: "Intro",
    body: "I design and build schema-backed software for teams that need their tools to keep up with the work.",
  }),
  block("rec_site_content_home", "2026-05-05T00:00:04.000Z", {
    type: "page",
    label: "Home",
    body: "A concise personal site for current work, writing, and project notes.",
    href: "/",
  }),
  block("rec_site_content_blog", "2026-05-05T00:00:05.000Z", {
    type: "page",
    label: "Blog",
    body: "Notes on product engineering",
    href: "/blog",
  }),
  block("rec_site_content_resume", "2026-05-05T00:00:06.000Z", {
    type: "page",
    label: "Resume",
    body: "A practical summary of roles, projects, and strengths.",
    href: "/resume",
  }),
  block("rec_site_content_projects", "2026-05-05T00:00:07.000Z", {
    type: "page",
    label: "Projects",
    body: "Current and recent product work",
    href: "/projects",
  }),
  block("rec_site_content_project_pricinglab", "2026-05-05T00:00:08.000Z", {
    type: "project",
    label: "PricingLab",
    body: "PricingLab helps teams turn **operational assumptions** into clear, reusable [pricing structures](https://pricinglab.com).",
    href: "/projects/pricinglab",
    date: "2026-05-01",
  }),
  block("rec_site_content_project_opensurf", "2026-05-05T00:00:09.000Z", {
    type: "project",
    label: "OpenSurf",
    body: "OpenSurf explores reliable browser automation and local-first agent execution.",
    href: "/projects/opensurf",
    date: "2026-05-08",
  }),
  block("rec_site_content_project_formless", "2026-05-05T00:00:10.000Z", {
    type: "project",
    label: "Formless",
    body: "Formless makes app schema describe enough behavior to produce useful generated software.",
    href: "/projects/formless",
    date: "2026-05-03",
  }),
  block("rec_site_content_post_shipped_schema", "2026-05-05T00:00:11.000Z", {
    type: "post",
    label: "Shipping schema-backed authoring",
    body: "The first useful content app should keep records flat and move composition into relationships and views.",
    href: "/blog/shipping-schema-backed-authoring",
    date: "2026-05-13",
  }),
  block("rec_site_content_post_draft_notes", "2026-05-05T00:00:12.000Z", {
    type: "post",
    label: "Draft notes on generated editorial tools",
    body: "Draft thoughts on where generic generated admin surfaces are helpful and where authoring affordances need more shape.",
    href: "/blog/generated-editorial-tools",
    date: "2026-05-06",
  }),
  block("rec_site_content_link_home", "2026-05-05T00:00:12.100Z", {
    type: "link",
    label: "Home",
    linkTargetMode: "internal",
    linkTargetBlock: "rec_site_content_home",
  }),
  block("rec_site_content_link_blog", "2026-05-05T00:00:12.200Z", {
    type: "link",
    label: "Blog",
    linkTargetMode: "internal",
    linkTargetBlock: "rec_site_content_blog",
  }),
  block("rec_site_content_link_projects", "2026-05-05T00:00:12.300Z", {
    type: "link",
    label: "Projects",
    linkTargetMode: "internal",
    linkTargetBlock: "rec_site_content_projects",
  }),
  block("rec_site_content_link_resume", "2026-05-05T00:00:12.400Z", {
    type: "link",
    label: "Resume",
    linkTargetMode: "internal",
    linkTargetBlock: "rec_site_content_resume",
  }),
  block("rec_site_content_link_github", "2026-05-05T00:00:13.000Z", {
    type: "link",
    label: "GitHub",
    href: "https://github.com/dpeek",
    linkTargetMode: "external",
    icon: githubIconSource,
  }),
  block("rec_site_content_link_linkedin", "2026-05-05T00:00:14.000Z", {
    type: "link",
    label: "LinkedIn",
    href: "https://linkedin.com/in/dpeekdotcom",
    linkTargetMode: "external",
    icon: linkedInIconSource,
  }),
  block("rec_site_content_group_header", "2026-05-05T00:00:16.000Z", {
    type: "header",
    label: "Header",
  }),
  block("rec_site_content_group_header_primary", "2026-05-05T00:00:16.100Z", {
    type: "headerPrimary",
    label: "Primary",
  }),
  block("rec_site_content_group_header_secondary", "2026-05-05T00:00:16.200Z", {
    type: "headerSecondary",
    label: "Secondary",
  }),
  block("rec_site_content_group_footer", "2026-05-05T00:00:16.500Z", {
    type: "footer",
    label: "Footer",
  }),
  block("rec_site_content_group_footer_main", "2026-05-05T00:00:17.000Z", {
    type: "footerSection",
    label: "Explore",
  }),
  block("rec_site_content_group_footer_social", "2026-05-05T00:00:18.000Z", {
    type: "footerSocial",
    label: "Social",
  }),
  block("rec_site_block_home_hero", "2026-05-05T00:00:18.100Z", {
    type: "hero",
    label: "Schema-backed software for content-heavy products",
    body: "I design and build schema-backed software for teams that need their tools to keep up with the work.",
  }),
  block("rec_site_block_home_recent_posts", "2026-05-05T00:00:18.200Z", {
    type: "group",
    label: "Recent posts",
  }),
  block("rec_site_block_home_projects", "2026-05-05T00:00:18.300Z", {
    type: "group",
    label: "Featured projects",
  }),
  block("rec_site_block_post_body", "2026-05-05T00:00:18.400Z", {
    type: "markdown",
    label: "Body",
    body: "The first useful content app should keep records flat and move composition into relationships and views.",
  }),
  placement(
    "rec_site_place_header_primary",
    "2026-05-05T00:00:19.000Z",
    "rec_site_content_group_header",
    "rec_site_content_group_header_primary",
    1000,
  ),
  placement(
    "rec_site_place_header_secondary",
    "2026-05-05T00:00:19.100Z",
    "rec_site_content_group_header",
    "rec_site_content_group_header_secondary",
    2000,
  ),
  placement(
    "rec_site_place_header_home",
    "2026-05-05T00:00:19.200Z",
    "rec_site_content_group_header_primary",
    "rec_site_content_link_home",
    1000,
  ),
  placement(
    "rec_site_place_header_blog",
    "2026-05-05T00:00:20.000Z",
    "rec_site_content_group_header_secondary",
    "rec_site_content_link_blog",
    1000,
  ),
  placement(
    "rec_site_place_header_projects",
    "2026-05-05T00:00:21.000Z",
    "rec_site_content_group_header_secondary",
    "rec_site_content_link_projects",
    2000,
  ),
  placement(
    "rec_site_place_header_resume",
    "2026-05-05T00:00:22.000Z",
    "rec_site_content_group_header_secondary",
    "rec_site_content_link_resume",
    3000,
  ),
  placement(
    "rec_site_place_footer_projects",
    "2026-05-05T00:00:23.000Z",
    "rec_site_content_group_footer_main",
    "rec_site_content_link_projects",
    1000,
  ),
  placement(
    "rec_site_place_footer_resume",
    "2026-05-05T00:00:24.000Z",
    "rec_site_content_group_footer_main",
    "rec_site_content_link_resume",
    2000,
  ),
  placement(
    "rec_site_place_footer_github",
    "2026-05-05T00:00:25.000Z",
    "rec_site_content_group_footer_social",
    "rec_site_content_link_github",
    1000,
  ),
  placement(
    "rec_site_place_footer_linkedin",
    "2026-05-05T00:00:26.000Z",
    "rec_site_content_group_footer_social",
    "rec_site_content_link_linkedin",
    2000,
  ),
  placement(
    "rec_site_place_footer_section_explore",
    "2026-05-05T00:00:26.200Z",
    "rec_site_content_group_footer",
    "rec_site_content_group_footer_main",
    1000,
  ),
  placement(
    "rec_site_place_footer_section_social",
    "2026-05-05T00:00:26.300Z",
    "rec_site_content_group_footer",
    "rec_site_content_group_footer_social",
    2000,
  ),
  placement(
    "rec_site_place_home_hero",
    "2026-05-05T00:00:27.000Z",
    "rec_site_content_home",
    "rec_site_block_home_hero",
    1000,
  ),
  placement(
    "rec_site_place_home_hero_image",
    "2026-05-05T00:00:27.100Z",
    "rec_site_block_home_hero",
    "rec_site_media_avatar",
    1000,
    "Portrait",
  ),
  placement(
    "rec_site_place_home_recent_posts",
    "2026-05-05T00:00:28.000Z",
    "rec_site_content_home",
    "rec_site_block_home_recent_posts",
    2000,
  ),
  placement(
    "rec_site_place_home_projects",
    "2026-05-05T00:00:29.000Z",
    "rec_site_content_home",
    "rec_site_block_home_projects",
    3000,
  ),
  placement(
    "rec_site_place_recent_posts_shipped_schema",
    "2026-05-05T00:00:29.100Z",
    "rec_site_block_home_recent_posts",
    "rec_site_content_post_shipped_schema",
    1000,
  ),
  placement(
    "rec_site_place_recent_posts_draft_notes",
    "2026-05-05T00:00:29.200Z",
    "rec_site_block_home_recent_posts",
    "rec_site_content_post_draft_notes",
    2000,
  ),
  placement(
    "rec_site_place_featured_project_pricinglab",
    "2026-05-05T00:00:29.300Z",
    "rec_site_block_home_projects",
    "rec_site_content_project_pricinglab",
    1000,
  ),
  placement(
    "rec_site_place_featured_project_opensurf",
    "2026-05-05T00:00:29.400Z",
    "rec_site_block_home_projects",
    "rec_site_content_project_opensurf",
    2000,
  ),
  placement(
    "rec_site_place_featured_project_formless",
    "2026-05-05T00:00:29.500Z",
    "rec_site_block_home_projects",
    "rec_site_content_project_formless",
    3000,
  ),
  placement(
    "rec_site_place_projects_pricinglab",
    "2026-05-05T00:00:29.600Z",
    "rec_site_content_projects",
    "rec_site_content_project_pricinglab",
    1000,
  ),
  placement(
    "rec_site_place_projects_opensurf",
    "2026-05-05T00:00:29.700Z",
    "rec_site_content_projects",
    "rec_site_content_project_opensurf",
    2000,
  ),
  placement(
    "rec_site_place_projects_formless",
    "2026-05-05T00:00:29.800Z",
    "rec_site_content_projects",
    "rec_site_content_project_formless",
    3000,
  ),
  placement(
    "rec_site_place_post_body",
    "2026-05-05T00:00:30.000Z",
    "rec_site_content_post_shipped_schema",
    "rec_site_block_post_body",
    1000,
  ),
  placement(
    "rec_site_place_post_profile",
    "2026-05-05T00:00:31.000Z",
    "rec_site_content_post_shipped_schema",
    "rec_site_content_profile_intro",
    2000,
    "Profile",
  ),
];

function block(id: string, createdAt: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values: {
      site: "rec_site_settings_primary",
      ...values,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function placement(
  id: string,
  createdAt: string,
  parent: string,
  child: string,
  order: number,
  label?: string,
): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values: {
      parent,
      block: child,
      order,
      ...(label === undefined ? {} : { label }),
    },
    createdAt,
    updatedAt: createdAt,
  };
}
