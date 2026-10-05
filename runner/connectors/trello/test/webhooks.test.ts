import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.acceptEnterpriseJoinRequest",
  "webhook.addAttachmentToCard",
  "webhook.addChecklistToCard",
  "webhook.addLabelToCard",
  "webhook.addMemberToBoard",
  "webhook.addMemberToOrganization",
  "webhook.addOrganizationToEnterprise",
  "webhook.addToEnterprisePluginWhitelist",
  "webhook.addToOrganizationBoard",
  "webhook.board_updated",
  "webhook.card_comment",
  "webhook.card_created",
  "webhook.card_deleted",
  "webhook.card_updated",
  "webhook.checklist_updated",
  "webhook.convertToCardFromCheckItem",
  "webhook.copyBoard",
  "webhook.copyCard",
  "webhook.copyChecklist",
  "webhook.copyCommentCard",
  "webhook.createBoard",
  "webhook.createBoardInvitation",
  "webhook.createBoardPreference",
  "webhook.createCheckItem",
  "webhook.createLabel",
  "webhook.createOrganization",
  "webhook.createOrganizationInvitation",
  "webhook.deactivatedMemberInBoard",
  "webhook.deactivatedMemberInEnterprise",
  "webhook.deactivatedMemberInOrganization",
  "webhook.deleteAttachmentFromCard",
  "webhook.deleteBoardInvitation",
  "webhook.deleteCheckItem",
  "webhook.deleteComment",
  "webhook.deleteLabel",
  "webhook.deleteOrganizationInvitation",
  "webhook.disableEnterprisePluginWhitelist",
  "webhook.disablePlugin",
  "webhook.disablePowerUp",
  "webhook.emailCard",
  "webhook.enableEnterprisePluginWhitelist",
  "webhook.enablePlugin",
  "webhook.enablePowerUp",
  "webhook.list_created",
  "webhook.makeAdminOfBoard",
  "webhook.makeAdminOfOrganization",
  "webhook.makeNormalMemberOfBoard",
  "webhook.makeNormalMemberOfOrganization",
  "webhook.makeObserverOfBoard",
  "webhook.memberJoinedTrello",
  "webhook.member_added",
  "webhook.moveCardFromBoard",
  "webhook.moveCardToBoard",
  "webhook.moveListFromBoard",
  "webhook.moveListToBoard",
  "webhook.reactivatedMemberInBoard",
  "webhook.reactivatedMemberInEnterprise",
  "webhook.reactivatedMemberInOrganization",
  "webhook.removeChecklistFromCard",
  "webhook.removeFromEnterprisePluginWhitelist",
  "webhook.removeFromOrganizationBoard",
  "webhook.removeLabelFromCard",
  "webhook.removeMemberFromBoard",
  "webhook.removeMemberFromCard",
  "webhook.removeMemberFromOrganization",
  "webhook.removeOrganizationFromEnterprise",
  "webhook.sortList",
  "webhook.unconfirmedBoardInvitation",
  "webhook.unconfirmedOrganizationInvitation",
  "webhook.updateCheckItem",
  "webhook.updateCheckItemStateOnCard",
  "webhook.updateComment",
  "webhook.updateLabel",
  "webhook.updateList",
  "webhook.updateMember",
  "webhook.updateOrganization",
  "webhook.voteOnCard",
] as const;

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const { actions } = compileDeclarativeConnector(manifest as never);

describe("trello webhook operations", () => {
  it("declares each trigger as kind webhook with EventOnly catalog limits and no handler", () => {
    for (const key of WEBHOOK_OPS) {
      const operation = operations[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind).toBe("webhook");
      expect(operation.timeoutMs).toBe(30000);
      expect(operation.maxInputBytes).toBe(1048576);
      expect(operation.maxResponseBytes).toBe(1048576);
      expect(operation.request, `${key} must not declare a request block`).toBeUndefined();
      expect(operation.sideEffect, `${key} must be sideEffect read`).toBe("read");
      expect(actions[key], `${key} must not compile to an HTTP handler`).toBeUndefined();
    }
  });

  it("declares the official webhook action types and the existing keys", () => {
    expect(
      Object.keys(operations)
        .filter((key) => key.startsWith("webhook."))
        .sort(),
    ).toEqual([...WEBHOOK_OPS].sort());
  });
});
