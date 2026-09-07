import { parseProfileResponse } from "./profile";
import type { NormalizedProfile } from "./profile";
import { parsePostsResponse } from "./posts";
import type { NormalizedPost } from "./posts";
import { parseOrganizationsResponse } from "./organizations";
import type { NormalizedOrganization } from "./organizations";

export type ProfileGetSyncInput = { response: unknown };
export type ProfileGetSyncResult = { provider: "linkedin"; operation: "profile.get"; items: NormalizedProfile[] };

export function executeProfileGetSync(input: ProfileGetSyncInput): ProfileGetSyncResult {
  const parsed = parseProfileResponse(input.response);
  return { provider: "linkedin", operation: "profile.get", items: parsed ? [parsed] : [] };
}

export type PostsListSyncInput = { response: unknown };
export type PostsListSyncResult = { provider: "linkedin"; operation: "posts.list"; items: NormalizedPost[]; nextStart: number | null };

export function executePostsListSync(input: PostsListSyncInput): PostsListSyncResult {
  const parsed = parsePostsResponse(input.response);
  return { provider: "linkedin", operation: "posts.list", items: parsed.posts, nextStart: parsed.nextStart };
}

export type OrganizationsListSyncInput = { response: unknown };
export type OrganizationsListSyncResult = { provider: "linkedin"; operation: "organizations.list"; items: NormalizedOrganization[]; nextStart: number | null };

export function executeOrganizationsListSync(input: OrganizationsListSyncInput): OrganizationsListSyncResult {
  const parsed = parseOrganizationsResponse(input.response);
  return { provider: "linkedin", operation: "organizations.list", items: parsed.organizations, nextStart: parsed.nextStart };
}
