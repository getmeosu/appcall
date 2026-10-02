import { describe, expect, test } from "bun:test";
import categoriesFixture from "../fixtures/discussion_categories.json";
import listFixture from "../fixtures/discussions_list.json";
import getFixture from "../fixtures/discussion_get.json";
import createFixture from "../fixtures/discussion_create.json";
import commentsFixture from "../fixtures/discussion_comments.json";
import commentFixture from "../fixtures/discussion_comment.json";
import {
  listDiscussionCategories,
  listDiscussions,
  getDiscussion,
  createDiscussion,
  updateDiscussion,
  listDiscussionComments,
  createDiscussionComment,
  updateDiscussionComment,
} from "../src/actions";
import {
  normalizeDiscussion,
  normalizeDiscussionCategory,
  normalizeDiscussionComment,
  validateListDiscussionCategoriesInput,
  validateListDiscussionsInput,
  validateGetDiscussionInput,
  validateCreateDiscussionInput,
  validateUpdateDiscussionInput,
  validateListDiscussionCommentsInput,
  validateCreateDiscussionCommentInput,
  validateUpdateDiscussionCommentInput,
} from "../src/discussions";

const discussionNode = (getFixture as { data: { repository: { discussion: Record<string, unknown> } } }).data.repository.discussion;
const categoryNode = (categoriesFixture as { data: { repository: { discussionCategories: { nodes: Record<string, unknown>[] } } } }).data.repository.discussionCategories.nodes[0];
const commentNode = (commentFixture as { data: { addDiscussionComment: { comment: Record<string, unknown> } } }).data.addDiscussionComment.comment;

function graphqlFetch(routes: Array<(query: string) => unknown>) {
  const reqs: { url: string; query: string; variables: Record<string, unknown> }[] = [];
  let i = 0;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = JSON.parse(String(init?.body ?? "{}")) as { query: string; variables: Record<string, unknown> };
    reqs.push({ url, query: body.query, variables: body.variables });
    const handler = routes[Math.min(i, routes.length - 1)];
    i += 1;
    return new Response(JSON.stringify(handler(body.query)), { status: 200 });
  };
  return { fetchImpl, reqs };
}

describe("github S9 discussions", () => {
  test("normalizes category, discussion, and comment fixtures", () => {
    const category = normalizeDiscussionCategory(categoryNode);
    expect(category.id).toBe("gh-discussion-category:DIC_kwDOA1");
    expect(category.name).toBe("Q&A");
    expect(category.isAnswerable).toBe(true);
    const discussion = normalizeDiscussion(discussionNode);
    expect(discussion.id).toBe("gh-discussion:7");
    expect(discussion.nodeId).toBe("D_kwDOA1");
    expect(discussion.author).toBe("octocat");
    expect(discussion.categoryName).toBe("Q&A");
    const comment = normalizeDiscussionComment(commentNode);
    expect(comment.id).toBe("gh-discussion-comment:DC_kwDOA1");
    expect(comment.author).toBe("hubot");
    expect(comment.replyToId).toBe("");
  });

  test("validates S9 inputs", () => {
    expect(validateListDiscussionCategoriesInput({ owner: "acme", repo: "app" }).repo).toBe("app");
    expect(validateListDiscussionsInput({ owner: "acme", repo: "app", answered: false, orderField: "CREATED_AT" }).orderField).toBe("CREATED_AT");
    expect(() => validateListDiscussionsInput({ owner: "acme", repo: "app", orderDirection: "SIDEWAYS" })).toThrow();
    expect(validateGetDiscussionInput({ owner: "acme", repo: "app", title: "How do I ship?" }).title).toBe("How do I ship?");
    expect(() => validateGetDiscussionInput({ owner: "acme", repo: "app" })).toThrow();
    expect(validateCreateDiscussionInput({ owner: "acme", repo: "app", categoryId: "DIC_kwDOA1", title: "T", body: "B" }).categoryId).toBe("DIC_kwDOA1");
    expect(() => validateCreateDiscussionInput({ owner: "acme", repo: "app", title: "T" })).toThrow();
    expect(validateUpdateDiscussionInput({ owner: "acme", repo: "app", discussionNumber: 7, body: "edited" }).body).toBe("edited");
    expect(() => validateUpdateDiscussionInput({ owner: "acme", repo: "app", discussionNumber: 7 })).toThrow();
    expect(validateListDiscussionCommentsInput({ owner: "acme", repo: "app", discussionNumber: 7 }).discussionNumber).toBe(7);
    expect(validateCreateDiscussionCommentInput({ owner: "acme", repo: "app", discussionId: "D_kwDOA1", body: "hi", replyToId: "DC_kwDOA1" }).replyToId).toBe("DC_kwDOA1");
    expect(() => validateCreateDiscussionCommentInput({ owner: "acme", repo: "app", body: "hi" })).toThrow();
    expect(validateUpdateDiscussionCommentInput({ owner: "acme", repo: "app", discussionNumber: 7, commentId: "DC_kwDOA1", body: "edited" }).commentId).toBe("DC_kwDOA1");
    expect(() => validateUpdateDiscussionCommentInput({ owner: "acme", repo: "app", commentId: "DC_kwDOA1", body: "edited" })).toThrow();
  });

  test("lists categories and discussions over GraphQL", async () => {
    const dry = listDiscussionCategories({ owner: "acme", repo: "app" });
    expect(dry.action).toBe("discussions.categories.list");

    const categories = graphqlFetch([() => categoriesFixture]);
    const listed = await listDiscussionCategories({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      fetch: categories.fetchImpl,
    });
    expect(categories.reqs[0].url).toBe("https://api.github.com/graphql");
    expect(categories.reqs[0].query).toContain("discussionCategories");
    expect((listed.categories as unknown[]).length).toBe(1);

    const discussions = graphqlFetch([() => listFixture]);
    const page = await listDiscussions({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      categoryId: "DIC_kwDOA1",
      answered: false,
      fetch: discussions.fetchImpl,
    });
    expect(discussions.reqs[0].query).toContain("orderBy");
    expect(discussions.reqs[0].variables.categoryId).toBe("DIC_kwDOA1");
    expect((page.discussions as unknown[]).length).toBe(1);
    expect((page.discussions as Record<string, unknown>[])[0].title).toBe("How do I ship?");
  });

  test("gets a discussion by number and by title for Reconcile", async () => {
    const byNumber = graphqlFetch([() => getFixture]);
    const got = await getDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      discussionNumber: 7,
      fetch: byNumber.fetchImpl,
    });
    expect(byNumber.reqs[0].variables.number).toBe(7);
    expect(got.found).toBe(true);
    expect((got.discussion as Record<string, unknown>).number).toBe(7);

    const byTitle = graphqlFetch([() => listFixture]);
    const observed = await getDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      categoryId: "DIC_kwDOA1",
      title: "How do I ship?",
      body: "Steps please",
      fetch: byTitle.fetchImpl,
    });
    expect(byTitle.reqs[0].query).toContain("DiscussionByTitle");
    expect(observed.found).toBe(true);

    const missing = graphqlFetch([() => ({
      data: { repository: { discussion: null } },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Discussion" }],
    })]);
    const absent = await getDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      discussionNumber: 99,
      fetch: missing.fetchImpl,
    });
    expect(absent.found).toBe(false);
    expect(absent.discussion).toBeNull();

    const paged = graphqlFetch([
      () => ({ data: { repository: { discussions: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-2" } } } } }),
      () => listFixture,
    ]);
    const later = await getDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      title: "How do I ship?",
      fetch: paged.fetchImpl,
    });
    expect(paged.reqs).toHaveLength(2);
    expect(paged.reqs[1].variables.after).toBe("cursor-2");
    expect(later.found).toBe(true);

    const partial = graphqlFetch([() => ({
      data: { repository: { discussions: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } },
      errors: [{ message: "Something went wrong." }],
    })]);
    await expect(getDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      title: "missing",
      fetch: partial.fetchImpl,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Something went wrong." });
  });

  test("creates and updates a discussion", async () => {
    const createdFetch = graphqlFetch([
      () => ({ data: { repository: { id: "R_kwDOA1" } } }),
      () => createFixture,
    ]);
    const created = await createDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      categoryId: "DIC_kwDOA1",
      title: "How do I ship?",
      body: "Steps please",
      fetch: createdFetch.fetchImpl,
    });
    expect(createdFetch.reqs).toHaveLength(2);
    expect(createdFetch.reqs[0].query).toContain("repository");
    expect(createdFetch.reqs[1].query).toContain("createDiscussion");
    expect((createdFetch.reqs[1].variables.input as Record<string, unknown>).repositoryId).toBe("R_kwDOA1");
    expect((created.discussion as Record<string, unknown>).number).toBe(7);

    const updatedFetch = graphqlFetch([
      () => ({ data: { repository: { discussion: { id: "D_kwDOA1" } } } }),
      () => ({ data: { updateDiscussion: { discussion: { ...discussionNode, body: "edited" } } } }),
    ]);
    const updated = await updateDiscussion({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      discussionNumber: 7,
      body: "edited",
      fetch: updatedFetch.fetchImpl,
    });
    expect(updatedFetch.reqs[1].query).toContain("updateDiscussion");
    expect((updatedFetch.reqs[1].variables.input as Record<string, unknown>).discussionId).toBe("D_kwDOA1");
    expect((updated.discussion as Record<string, unknown>).body).toBe("edited");
  });

  test("lists, creates, and updates comments", async () => {
    const listed = graphqlFetch([() => commentsFixture]);
    const comments = await listDiscussionComments({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      discussionNumber: 7,
      fetch: listed.fetchImpl,
    });
    expect(listed.reqs[0].query).toContain("comments");
    expect((comments.comments as unknown[]).length).toBe(1);

    const createdFetch = graphqlFetch([
      () => ({ data: { repository: { discussion: { id: "D_kwDOA1" } } } }),
      () => commentFixture,
    ]);
    const created = await createDiscussionComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      discussionNumber: 7,
      body: "Try the release workflow.",
      replyToId: "DC_parent",
      fetch: createdFetch.fetchImpl,
    });
    expect(createdFetch.reqs[1].query).toContain("addDiscussionComment");
    expect((createdFetch.reqs[1].variables.input as Record<string, unknown>).replyToId).toBe("DC_parent");
    expect((created.comment as Record<string, unknown>).author).toBe("hubot");

    const updatedFetch = graphqlFetch([
      () => ({ data: { updateDiscussionComment: { comment: { ...commentNode, body: "revised" } } } }),
    ]);
    const updated = await updateDiscussionComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      discussionNumber: 7,
      commentId: "DC_kwDOA1",
      body: "revised",
      fetch: updatedFetch.fetchImpl,
    });
    expect(updatedFetch.reqs).toHaveLength(1);
    expect((updatedFetch.reqs[0].variables.input as Record<string, unknown>).commentId).toBe("DC_kwDOA1");
    expect((updated.comment as Record<string, unknown>).body).toBe("revised");
  });

  test("surfaces GraphQL errors", async () => {
    const failing = graphqlFetch([() => ({ errors: [{ message: "Discussions are disabled." }] })]);
    await expect(listDiscussions({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      fetch: failing.fetchImpl,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Discussions are disabled." });
  });
});
