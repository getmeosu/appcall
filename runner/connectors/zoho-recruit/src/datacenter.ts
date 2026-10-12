/**
 * Zoho Recruit data centres (ZR-0, corrected in ZR-1).
 *
 * A connection picks its data centre with the connect-time `dataCenter` setup
 * field. The value must be an exact, case-sensitive match for one of the keys
 * below (lowercase, no trimming); anything else is rejected before a request is
 * built. There is no host or baseUrl input anywhere: every host comes from this
 * table. An absent value (undefined/null) means "com", so connections created
 * before ZR-0 keep sending exactly the requests they sent before.
 *
 * Sources (official Zoho docs + live probes, 2026-10-12):
 * - Accounts hosts: https://www.zoho.com/recruit/developer-guide/apiv2/access-refresh.html
 *   and https://www.zoho.com/accounts/protocol/oauth/multi-dc.html
 *   (CA = accounts.zohocloud.ca, SA = accounts.zoho.sa; https://accounts.zoho.com/oauth/serverinfo).
 * - Recruit API host (ZR-1 correction): Zoho Recruit v2 is served on recruit.<dc>
 *   (CA: recruit.zohocloud.ca), the host every Recruit API page uses
 *   (https://www.zoho.com/recruit/developer-guide/apiv2/get-records.html). Live: every
 *   recruit.<dc>/recruit/v2/users answers Recruit's own 401 AUTHENTICATION_FAILURE JSON,
 *   while www.zohoapis.{com,eu,in,ca}/recruit/v2/* answers 404 "API endpoint not found".
 *   ZR-0 routed non-US DCs to www.zohoapis.<dc>, which therefore could not work.
 * - api_domain (token response) equivalents per DC, accepted by assertApiDomainMatches:
 *   https://api.zoho.<dc> (developer OAuth docs: "api_domain":"https://api.zoho.com",
 *   multi-dc-support.html: "https://api.zoho.eu"; CA is api.zohocloud.ca because
 *   zoho.ca does not exist), https://www.zohoapis.<dc> (multi-dc.html, access-refresh.html)
 *   and the Recruit host itself. None of them is ever used to build a request URL.
 */

export const ZOHO_RECRUIT_DATA_CENTERS = {
  com: {
    accountsUrl: "https://accounts.zoho.com",
    apiBaseUrl: "https://recruit.zoho.com/recruit/v2",
    apiDomains: ["https://www.zohoapis.com", "https://api.zoho.com", "https://recruit.zoho.com"],
  },
  eu: {
    accountsUrl: "https://accounts.zoho.eu",
    apiBaseUrl: "https://recruit.zoho.eu/recruit/v2",
    apiDomains: ["https://www.zohoapis.eu", "https://api.zoho.eu", "https://recruit.zoho.eu"],
  },
  in: {
    accountsUrl: "https://accounts.zoho.in",
    apiBaseUrl: "https://recruit.zoho.in/recruit/v2",
    apiDomains: ["https://www.zohoapis.in", "https://api.zoho.in", "https://recruit.zoho.in"],
  },
  "com.au": {
    accountsUrl: "https://accounts.zoho.com.au",
    apiBaseUrl: "https://recruit.zoho.com.au/recruit/v2",
    apiDomains: ["https://www.zohoapis.com.au", "https://api.zoho.com.au", "https://recruit.zoho.com.au"],
  },
  jp: {
    accountsUrl: "https://accounts.zoho.jp",
    apiBaseUrl: "https://recruit.zoho.jp/recruit/v2",
    apiDomains: ["https://www.zohoapis.jp", "https://api.zoho.jp", "https://recruit.zoho.jp"],
  },
  ca: {
    accountsUrl: "https://accounts.zohocloud.ca",
    apiBaseUrl: "https://recruit.zohocloud.ca/recruit/v2",
    apiDomains: ["https://www.zohoapis.ca", "https://api.zohocloud.ca", "https://recruit.zohocloud.ca"],
  },
  sa: {
    accountsUrl: "https://accounts.zoho.sa",
    apiBaseUrl: "https://recruit.zoho.sa/recruit/v2",
    apiDomains: ["https://www.zohoapis.sa", "https://api.zoho.sa", "https://recruit.zoho.sa"],
  },
  "com.cn": {
    accountsUrl: "https://accounts.zoho.com.cn",
    apiBaseUrl: "https://recruit.zoho.com.cn/recruit/v2",
    apiDomains: ["https://www.zohoapis.com.cn", "https://api.zoho.com.cn", "https://recruit.zoho.com.cn"],
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

/** Host of a DC's Recruit API base URL (e.g. "recruit.zohocloud.ca"). */
export function apiHostFor(dc: ZohoRecruitDataCenter): string {
  return new URL(dataCenterConfig(dc).apiBaseUrl).hostname;
}

/**
 * Verify a Zoho token response's api_domain against the chosen data centre.
 *
 * Dormant today (ZR-1, documented and tested): the connector reads api_domain /
 * apiDomain from the operation input, but no platform path supplies it yet. The
 * OAuth lifecycle resolves a token connection to { accessToken } only and does
 * not keep api_domain from the token response. Once a platform card stores it,
 * this check activates with no connector change.
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
