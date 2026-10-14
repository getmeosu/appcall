// TT-1 (TT-EFFECTS): the 25 delete ops (20 destructive, 5 write) and their sideEffect decision.
// destructive = the deletion is irreversible (the object and its ID are gone).
// write = the op removes a relationship or list entry that the paired op
// restores to the same state (see parity-briefs/tiktok-ads-tt1-selflock.md).
export const TT1_DESTRUCTIVE_OPS = [
  "catalogs.delete",
  "catalogs.feeds.delete",
  "catalogs.products.delete",
  "catalogs.product_sets.delete",
  "catalogs.videos.delete",
  "custom_audiences.delete",
  "saved_audiences.delete",
  "pixels.events.delete",
  "bc.assets.admin.delete",
  "bc.asset_groups.delete",
  "campaigns.gmv_max.sessions.delete",
  "comments.delete",
  "creatives.assets.delete",
  "playables.delete",
  "offline_events.delete",
  "leads.mock.delete",
  "portfolios.delete",
  "custom_conversions.delete",
  "identities.delete",
  // linus ruling (#665): bc.partners.add restores membership, not the specific
  // asset_ids/asset_type shares, and no op re-shares assets to a partner.
  "bc.partner_assets.delete",
  // L2-27: the L2 batch adds one more irreversible delete. TikTok documents
  // DELETE /gmv_max/creation/custom_anchor_video_list/delete/ as a permanent
  // deletion of shop-level customized posts; there is no restore route.
  "gmv_max.customized_posts.delete",
] as const;

// Reversible deletes kept as write, with the op that restores the state.
export const TT1_REVERSIBLE_DELETES: Record<string, string> = {
  "bc.members.delete": "bc.members.invite",
  "bc.partners.delete": "bc.partners.add",
  "subscriptions.delete": "subscriptions.create",
  "blocked_words.delete": "blocked_words.create",
  // linus ruling: re-adding the keyword restores the state.
  "search_ads.negative_keywords.delete": "search_ads.negative_keywords.add",
};

export const TT1_DESTRUCTIVE = new Set<string>(TT1_DESTRUCTIVE_OPS);
