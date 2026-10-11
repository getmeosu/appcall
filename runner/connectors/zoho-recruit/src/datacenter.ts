/**
 * Zoho Recruit data centres (ZR-0).
 *
 * A connection picks its data centre with the connect-time `dataCenter` setup
 * field. The value must be an exact, case-sensitive match for one of the keys
 * below (lowercase, no trimming); anything else is rejected before a request is
 * built. There is no host or baseUrl input anywhere: every host comes from this
 * table. An absent value (undefined/null) means "com", so connections created
 * before ZR-0 keep sending exactly the requests they sent before.
 *
 * Sources (official Zoho docs, fetched 2026-10-12):
 * - Accounts hosts: https://www.zoho.com/recruit/developer-guide/apiv2/access-refresh.html
 *   (US, AU, EU, IN, CA, SA, CN, JP) and https://www.zoho.com/accounts/protocol/oauth/multi-dc.html
 *   (CA = accounts.zohocloud.ca, SA = accounts.zoho.sa; also https://accounts.zoho.com/oauth/serverinfo).
 * - Recruit API host: the token response's api_domain is "Domain name of the API. Use this
 *   domain in your requests to make API calls to Zoho Recruit" (access-refresh.html; US
 *   sample https://www.zohoapis.com). multi-dc.html shows https://www.zohoapis.eu/recruit/v2
 *   and https://www.zohoapis.com.cn/recruit/v2. The per-DC www.zohoapis.<tld> domains for
 *   AU/IN/JP/CA/SA are Zoho's cross-product DC table
 *   (https://www.zoho.com/books/api/v3/introduction/ , https://www.zoho.com/directory/api/v2/introduction/).
 * - US keeps the documented dedicated Recruit domain https://recruit.zoho.com/recruit/v2
 *   (https://www.zoho.com/recruit/developer-guide/apiv2/whats-new.html, get-records.html),
 *   which is what this connector has always called. whats-new.html also documents
 *   recruit.zoho.{eu,com.cn,in,jp}; those are accepted as api_domain values for their DC.
 */

export const ZOHO_RECRUIT_DATA_CENTERS = {
  com: {
    accountsUrl: "https://accounts.zoho.com",
    apiBaseUrl: "https://recruit.zoho.com/recruit/v2",
    apiDomains: ["https://www.zohoapis.com", "https://recruit.zoho.com"],
  },
  eu: {
    accountsUrl: "https://accounts.zoho.eu",
    apiBaseUrl: "https://www.zohoapis.eu/recruit/v2",
    apiDomains: ["https://www.zohoapis.eu", "https://recruit.zoho.eu"],
  },
  in: {
    accountsUrl: "https://accounts.zoho.in",
    apiBaseUrl: "https://www.zohoapis.in/recruit/v2",
    apiDomains: ["https://www.zohoapis.in", "https://recruit.zoho.in"],
  },
  "com.au": {
    accountsUrl: "https://accounts.zoho.com.au",
    apiBaseUrl: "https://www.zohoapis.com.au/recruit/v2",
    apiDomains: ["https://www.zohoapis.com.au"],
  },
  jp: {
    accountsUrl: "https://accounts.zoho.jp",
    apiBaseUrl: "https://www.zohoapis.jp/recruit/v2",
    apiDomains: ["https://www.zohoapis.jp", "https://recruit.zoho.jp"],
  },
  ca: {
    accountsUrl: "https://accounts.zohocloud.ca",
    apiBaseUrl: "https://www.zohoapis.ca/recruit/v2",
    apiDomains: ["https://www.zohoapis.ca"],
  },
  sa: {
    accountsUrl: "https://accounts.zoho.sa",
    apiBaseUrl: "https://www.zohoapis.sa/recruit/v2",
    apiDomains: ["https://www.zohoapis.sa"],
  },
  "com.cn": {
    accountsUrl: "https://accounts.zoho.com.cn",
    apiBaseUrl: "https://www.zohoapis.com.cn/recruit/v2",
    apiDomains: ["https://www.zohoapis.com.cn", "https://recruit.zoho.com.cn"],
  },
} as const;

export type ZohoRecruitDataCenter = keyof typeof ZOHO_RECRUIT_DATA_CENTERS;
export type ZohoRecruitDataCenterConfig = (typeof ZOHO_RECRUIT_DATA_CENTERS)[ZohoRecruitDataCenter];

export const ZOHO_RECRUIT_DATA_CENTER_KEYS = Object.keys(ZOHO_RECRUIT_DATA_CENTERS) as ZohoRecruitDataCenter[];
export const DEFAULT_ZOHO_RECRUIT_DATA_CENTER: ZohoRecruitDataCenter = "com";

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

/**
 * Resolve the connection's data centre. undefined/null → "com"; otherwise the
 * value must be one of the allowlisted keys exactly (case-sensitive, untrimmed).
 */
export function resolveDataCenter(value: unknown): ZohoRecruitDataCenter {
  if (value === undefined || value === null) return DEFAULT_ZOHO_RECRUIT_DATA_CENTER;
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(ZOHO_RECRUIT_DATA_CENTERS, value)) {
    return value as ZohoRecruitDataCenter;
  }
  return invalidInput(`dataCenter must be exactly one of: ${ZOHO_RECRUIT_DATA_CENTER_KEYS.join(", ")}`);
}

export function dataCenterConfig(dc: ZohoRecruitDataCenter): ZohoRecruitDataCenterConfig {
  return ZOHO_RECRUIT_DATA_CENTERS[dc];
}

/** Normalized "scheme://host" (lowercase, default port dropped), or null when not a plain origin. */
function normalizedOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.search || url.hash) return null;
  if (url.protocol !== "https:") return null;
  if (url.port && url.port !== "443") return null;
  return `${url.protocol}//${url.hostname.toLowerCase()}`;
}

/**
 * Verify a Zoho token response's api_domain against the chosen data centre.
 * Absent (undefined/null) is accepted: nothing to verify. Any present value must
 * normalize to one of the DC's allowlisted API origins; otherwise this throws a
 * CONNECTOR_DATA_CENTER_MISMATCH error. The returned domain is never used to
 * build a request URL; requests always go to the table's apiBaseUrl.
 */
export function assertApiDomainMatches(dc: ZohoRecruitDataCenter, apiDomain: unknown): void {
  if (apiDomain === undefined || apiDomain === null) return;
  const allowed = dataCenterConfig(dc).apiDomains as readonly string[];
  const origin = typeof apiDomain === "string" ? normalizedOrigin(apiDomain.trim()) : null;
  if (origin && allowed.includes(origin)) return;
  throw {
    ok: false,
    code: "CONNECTOR_DATA_CENTER_MISMATCH",
    message: `Zoho returned an api_domain that does not belong to data centre "${dc}" (expected ${allowed.join(" or ")}). Reconnect with the matching dataCenter.`,
  };
}
