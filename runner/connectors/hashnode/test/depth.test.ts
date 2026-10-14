import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../hashnode.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);

// L2-18 batch: the 54 missing_http rows implemented as declarative GraphQL
// operations. Each entry is [Composio tool slug, AppCall operation, documented
// GraphQL field]. Field names and input fields were verified against the
// archived Hashnode API docs (https://apidocs.hashnode.com/, snapshot
// 20260321221642).
const batch: Array<[string, string, string, "query" | "mutation"]> = [
  ["HASHNODE_ACCEPT_INVITE_TO_PUBLICATION", "publications.acceptInvite", "acceptInviteToPublication", "mutation"],
  ["HASHNODE_ADD_COMMENT", "comments.create", "addComment", "mutation"],
  ["HASHNODE_ADD_CONTENT_BLOCK", "contentBlocks.create", "addContentBlock", "mutation"],
  ["HASHNODE_ADD_CUSTOM_MDX_COMPONENT", "mdxComponents.create", "addCustomMdxComponent", "mutation"],
  ["HASHNODE_ADD_DOCUMENTATION_PROJECT_CUSTOM_DOMAIN", "documentationProjects.addCustomDomain", "addDocumentationProjectCustomDomain", "mutation"],
  ["HASHNODE_ADD_REPLY", "replies.create", "addReply", "mutation"],
  ["HASHNODE_CHECK_CUSTOM_DOMAIN_AVAILABILITY", "domains.checkCustomDomainAvailability", "checkCustomDomainAvailability", "query"],
  ["HASHNODE_CHECK_SUBDOMAIN_AVAILABILITY", "domains.checkSubdomainAvailability", "checkSubdomainAvailability", "query"],
  ["HASHNODE_CREATE_DOCUMENTATION_API_REFERENCE", "documentationApiReferences.create", "createDocumentationApiReference", "mutation"],
  ["HASHNODE_CREATE_DOCUMENTATION_LINK", "documentationLinks.create", "createDocumentationLink", "mutation"],
  ["HASHNODE_CREATE_DOCUMENTATION_PROJECT", "documentationProjects.create", "createDocumentationProject", "mutation"],
  ["HASHNODE_CREATE_DOCUMENTATION_SECTION", "documentationSections.create", "createDocumentationSection", "mutation"],
  ["HASHNODE_CREATE_HASHNODE_DOCUMENTATION_GUIDE", "documentationGuides.create", "createDocumentationGuide", "mutation"],
  ["HASHNODE_DELETE_CONTENT_BLOCK", "contentBlocks.remove", "deleteContentBlock", "mutation"],
  ["HASHNODE_DELETE_CUSTOM_MDX_COMPONENT", "mdxComponents.remove", "deleteCustomMdxComponent", "mutation"],
  ["HASHNODE_DISABLE_DOCUMENTATION_PROJECT_AI_SEARCH", "documentationProjects.disableAiSearch", "disableDocumentationProjectAISearch", "mutation"],
  ["HASHNODE_FETCH_INVITATIONS", "publications.listInvites", "invites", "query"],
  ["HASHNODE_FETCH_SERIES_POSTS", "series.listPosts", "series", "query"],
  ["HASHNODE_FETCH_SINGLE_ARTICLE", "posts.getBySlug", "post", "query"],
  ["HASHNODE_FOLLOW_TAGS", "tags.follow", "followTags", "mutation"],
  ["HASHNODE_GEN_DOC_PROJECT_PREVIEW_AUTH_TOKEN", "documentationProjects.generatePreviewAuthToken", "generateDocumentationProjectPreviewAuthorizationToken", "mutation"],
  ["HASHNODE_GET_DOCUMENTATION_PROJECT", "documentationProjects.get", "documentationProject", "query"],
  ["HASHNODE_LIKE_COMMENT", "comments.like", "likeComment", "mutation"],
  ["HASHNODE_LIKE_POST", "posts.like", "likePost", "mutation"],
  ["HASHNODE_LIKE_REPLY", "replies.like", "likeReply", "mutation"],
  ["HASHNODE_LIST_TOP_COMMENTERS", "publications.listTopCommenters", "topCommenters", "query"],
  ["HASHNODE_MAP_DOC_PROJECT_CUSTOM_DOMAIN_WWW_REDIRECT", "documentationProjects.mapCustomDomainWwwRedirect", "mapDocumentationProjectCustomDomainWwwRedirect", "mutation"],
  ["HASHNODE_MOVE_DOCUMENTATION_SIDEBAR_ITEM", "documentationSidebarItems.move", "moveDocumentationSidebarItem", "mutation"],
  ["HASHNODE_PUBLISH_DOCUMENTATION_API_REFERENCE", "documentationApiReferences.publish", "publishDocumentationApiReference", "mutation"],
  ["HASHNODE_REMOVE_COMMENT", "comments.remove", "removeComment", "mutation"],
  ["HASHNODE_REMOVE_DOCUMENTATION_GUIDE", "documentationGuides.remove", "removeDocumentationGuide", "mutation"],
  ["HASHNODE_REMOVE_DOCUMENTATION_PROJECT", "documentationProjects.remove", "removeDocumentationProject", "mutation"],
  ["HASHNODE_REMOVE_DOCUMENTATION_PROJECT_CUSTOM_DOMAIN", "documentationProjects.removeCustomDomain", "removeDocumentationProjectCustomDomain", "mutation"],
  ["HASHNODE_REMOVE_DOCUMENTATION_SIDEBAR_ITEM", "documentationSidebarItems.remove", "removeDocumentationSidebarItem", "mutation"],
  ["HASHNODE_REMOVE_REPLY", "replies.remove", "removeReply", "mutation"],
  ["HASHNODE_RENAME_DOCUMENTATION_GUIDE", "documentationGuides.rename", "renameDocumentationGuide", "mutation"],
  ["HASHNODE_RENAME_DOCUMENTATION_SIDEBAR_ITEM", "documentationSidebarItems.rename", "renameDocumentationSidebarItem", "mutation"],
  ["HASHNODE_RESTORE_POST", "posts.restore", "restorePost", "mutation"],
  ["HASHNODE_SAVE_DOCUMENTATION_PAGE_DRAFT_CONTENT", "documentationPageDrafts.saveContent", "saveDocumentationPageDraftContent", "mutation"],
  ["HASHNODE_SUBSCRIBE_TO_NEWSLETTER", "newsletters.subscribe", "subscribeToNewsletter", "mutation"],
  ["HASHNODE_TOGGLE_FOLLOW_USER", "users.toggleFollow", "toggleFollowUser", "mutation"],
  ["HASHNODE_UNFOLLOW_TAGS", "tags.unfollow", "unfollowTags", "mutation"],
  ["HASHNODE_UNSUBSCRIBE_FROM_NEWSLETTER", "newsletters.unsubscribe", "unsubscribeFromNewsletter", "mutation"],
  ["HASHNODE_UPDATE_COMMENT", "comments.update", "updateComment", "mutation"],
  ["HASHNODE_UPDATE_CONTENT_BLOCK", "contentBlocks.update", "updateContentBlock", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_APPEARANCE", "documentationProjects.updateAppearance", "updateDocumentationAppearance", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_GENERAL_SETTINGS", "documentationProjects.updateGeneralSettings", "updateDocumentationGeneralSettings", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_GUIDE", "documentationGuides.update", "updateDocumentationGuide", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_INTEGRATIONS", "documentationProjects.updateIntegrations", "updateDocumentationIntegrations", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_LINK", "documentationLinks.update", "updateDocumentationLink", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_PROJECT_SUBDOMAIN", "documentationProjects.updateSubdomain", "updateDocumentationProjectSubdomain", "mutation"],
  ["HASHNODE_UPDATE_DOCUMENTATION_SECTION", "documentationSections.update", "updateDocumentationSection", "mutation"],
  ["HASHNODE_UPDATE_REPLY", "replies.update", "updateReply", "mutation"],
  ["HASHNODE_VERIFY_DOCUMENTATION_PROJECT_CUSTOM_DOMAIN", "documentationProjects.verifyCustomDomain", "verifyDocumentationProjectCustomDomain", "mutation"],
];

const removalOps = new Set([
  "contentBlocks.remove",
  "mdxComponents.remove",
  "comments.remove",
  "documentationGuides.remove",
  "documentationProjects.remove",
  "documentationProjects.removeCustomDomain",
  "documentationSidebarItems.remove",
  "replies.remove",
]);

describe("Hashnode L2 depth batch", () => {
  test("coverage artifact accounts for all 67 tools exactly once with no missing_http", () => {
    const tools = [...coverage.mapped, ...coverage.missing_http, ...coverage.missing_still].map((row) => row.tool);
    expect(coverage.composio_tools).toBe(67);
    expect(coverage.full_depth).toBe(true);
    expect(coverage.missing_http).toEqual([]);
    expect(tools).toHaveLength(67);
    expect(new Set(tools).size).toBe(67);
  });

  test("the 54 batch tools are mapped to the documented GraphQL operations", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation, field, kind] of batch) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(typeof definition?.request?.method, operation).toBe("string");
      expect(typeof actions[operation], operation).toBe("function");
      const query = String(definition.request.body.query);
      expect(query.startsWith(kind), `${operation} document kind`).toBe(true);
      expect(new RegExp(`\\b${field}\\b`).test(query), `${operation} calls ${field}`).toBe(true);
      expect(definition.request.method).toBe("POST");
      expect(definition.request.path).toBe("/");
      expect(definition.request.success).toEqual([200]);
      expect(definition.validationMode).toBe("strict-generated");
      expect(definition.responseFormat).toBe("json");
      expect(definition.enforceOutputSchema).toBe(true);
      expect(definition.outputSchema.type).toBe("object");
      expect(definition.inputSchema.type).toBe("object");
      expect(definition.inputSchema.additionalProperties).toBe(false);
      expect(definition.sideEffect).toBe(
        removalOps.has(operation) ? "destructive" : kind === "mutation" ? "write" : "read",
      );
    }
  });

  test("the batch cases carry the documented POST body and GraphQL envelope", () => {
    for (const [tool, operation, field] of batch) {
      const casePath = new URL(`../fixtures/cases/${operation}-success.json`, import.meta.url);
      const fixture = JSON.parse(readFileSync(casePath, "utf8"));
      expect(fixture.operation, tool).toBe(operation);
      expect(fixture.credentials).toEqual({ apiKey: "fixture-api-token" });
      expect(fixture.expected.kind).toBe("success");
      expect(fixture.exchanges).toHaveLength(1);
      const exchange = fixture.exchanges[0];
      expect(exchange.request.method).toBe("POST");
      expect(exchange.request.url).toBe("https://gql.hashnode.com/");
      const body = JSON.parse(exchange.request.body);
      expect(body.query).toBe(operations[operation].request.body.query);
      expect(typeof body.variables).toBe("object");
      const response = JSON.parse(
        readFileSync(new URL(`../fixtures/responses/${operation}.json`, import.meta.url), "utf8"),
      );
      expect(response.data, operation).toBeDefined();
      expect(JSON.stringify(response.data), `${operation} response envelope`).toContain(`"${field}"`);
    }
  });

  test("no batch operation leaked back into missing_http", () => {
    const pending = new Set(coverage.missing_http.map((row) => row.tool));
    for (const [tool] of batch) expect(pending.has(tool), tool).toBe(false);
  });
});
