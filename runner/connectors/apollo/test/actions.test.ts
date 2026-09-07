import { describe, expect, test } from "bun:test";
import peopleSearchFixture from "../fixtures/people_search.json";
import peopleMatchFixture from "../fixtures/people_match.json";
import peopleBulkMatchFixture from "../fixtures/people_bulk_match.json";
import organizationsSearchFixture from "../fixtures/organizations_search.json";
import organizationsEnrichFixture from "../fixtures/organizations_enrich.json";
import organizationsBulkEnrichFixture from "../fixtures/organizations_bulk_enrich.json";
import organizationsJobPostingsFixture from "../fixtures/organizations_job_postings.json";
import contactCreateFixture from "../fixtures/contact_create.json";
import contactUpdateFixture from "../fixtures/contact_update.json";
import contactsSearchFixture from "../fixtures/contacts_search.json";
import accountCreateFixture from "../fixtures/account_create.json";
import accountUpdateFixture from "../fixtures/account_update.json";
import sequencesSearchFixture from "../fixtures/sequences_search.json";
import sequencesAddContactsFixture from "../fixtures/sequences_add_contacts.json";
import emailAccountsListFixture from "../fixtures/email_accounts_list.json";
import usersSearchFixture from "../fixtures/users_search.json";

import {
  searchPeople,
  matchPerson,
  bulkMatchPeople,
  searchOrganizations,
  enrichOrganization,
  bulkEnrichOrganizations,
  getOrganizationJobPostings,
  createContact,
  updateContact,
  searchContacts,
  createAccount,
  updateAccount,
  searchSequences,
  addContactsToSequence,
  listEmailAccounts,
  searchUsers,
  validatePeopleSearchInput,
  validatePeopleMatchInput,
  validatePeopleBulkMatchInput,
  validateOrganizationsSearchInput,
  validateOrganizationsEnrichInput,
  validateOrganizationsBulkEnrichInput,
  validateOrganizationsJobPostingsInput,
  validateContactsCreateInput,
  validateContactsUpdateInput,
  validateContactsSearchInput,
  validateAccountsCreateInput,
  validateAccountsUpdateInput,
  validateSequencesSearchInput,
  validateSequencesAddContactsInput,
  validateEmailAccountsListInput,
  validateUsersSearchInput,
} from "../src/actions";

// ─── people.search ────────────────────────────────────────────────────────────

describe("searchPeople", () => {
  test("returns validated output without apiKey", () => {
    const result = searchPeople({ q_keywords: "VP Sales", page: 1 });
    expect(result.connector).toBe("apollo");
    expect(result.action).toBe("people.search");
    expect(result.source).toBe("connector");
    expect((result.validated as { q_keywords?: string }).q_keywords).toBe("VP Sales");
  });

  test("calls POST /api/v1/mixed_people/api_search with X-Api-Key header", async () => {
    const requests: Request[] = [];
    const result = await searchPeople({
      apiKey: "test_key",
      q_keywords: "VP Sales",
      person_titles: ["VP of Sales"],
      per_page: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(peopleSearchFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/mixed_people/api_search");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("X-Api-Key")).toBe("test_key");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(requests[0].headers.get("Cache-Control")).toBe("no-cache");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.q_keywords).toBe("VP Sales");
    expect(body.person_titles).toEqual(["VP of Sales"]);
    expect(body.per_page).toBe(10);
    expect(result.action).toBe("people.search");
    expect(Array.isArray(result.people)).toBe(true);
    expect((result.people as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchPeople({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(searchPeople({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── people.match ─────────────────────────────────────────────────────────────

describe("matchPerson", () => {
  test("returns validated output without apiKey", () => {
    const result = matchPerson({ email: "jane@acme.com", domain: "acme.com" });
    expect(result.connector).toBe("apollo");
    expect(result.action).toBe("people.match");
    expect((result.validated as { email?: string }).email).toBe("jane@acme.com");
  });

  test("calls POST /api/v1/people/match", async () => {
    const requests: Request[] = [];
    const result = await matchPerson({
      apiKey: "test_key",
      first_name: "Jane",
      last_name: "Smith",
      email: "jane.smith@acme.com",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(peopleMatchFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/people/match");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.first_name).toBe("Jane");
    expect(body.email).toBe("jane.smith@acme.com");
    expect(result.action).toBe("people.match");
    expect(result.person).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(matchPerson({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 422 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(matchPerson({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 422 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test('people.match forwards an Apollo id in the request body', async () => {
    const requests: Request[] = [];
    await matchPerson({
      apiKey: 'test_key',
      id: '54a6ff3a74686965d97c8a0b',
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ person: { id: '54a6ff3a74686965d97c8a0b', email: 'x@y.com' } }), { status: 200 });
      },
    });
    expect(requests[0].url).toBe('https://api.apollo.io/api/v1/people/match');
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.id).toBe('54a6ff3a74686965d97c8a0b');
  });
});

// ─── people.bulk_match ────────────────────────────────────────────────────────

describe("bulkMatchPeople", () => {
  test("returns validated output without apiKey", () => {
    const result = bulkMatchPeople({ details: [{ email: "jane@acme.com" }] });
    expect(result.connector).toBe("apollo");
    expect(result.action).toBe("people.bulk_match");
    expect((result.validated as { details: unknown[] }).details).toHaveLength(1);
  });

  test("throws when details is missing", () => {
    expect(() => validatePeopleBulkMatchInput({})).toThrow("details is required");
  });

  test("calls POST /api/v1/people/bulk_match", async () => {
    const requests: Request[] = [];
    const details = [{ email: "jane@acme.com" }, { email: "bob@techco.io" }];
    const result = await bulkMatchPeople({
      apiKey: "test_key",
      details,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(peopleBulkMatchFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/people/bulk_match");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(Array.isArray(body.details)).toBe(true);
    expect(result.action).toBe("people.bulk_match");
    expect(Array.isArray(result.matches)).toBe(true);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(bulkMatchPeople({
      apiKey: "test_key",
      details: [],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── organizations.search ─────────────────────────────────────────────────────

describe("searchOrganizations", () => {
  test("returns validated output without apiKey", () => {
    const result = searchOrganizations({ q_organization_name: "Acme" });
    expect(result.connector).toBe("apollo");
    expect(result.action).toBe("organizations.search");
    expect((result.validated as { q_organization_name?: string }).q_organization_name).toBe("Acme");
  });

  test("calls POST /api/v1/mixed_companies/search", async () => {
    const requests: Request[] = [];
    const result = await searchOrganizations({
      apiKey: "test_key",
      q_organization_name: "Acme",
      organization_locations: ["United States"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(organizationsSearchFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/mixed_companies/search");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.q_organization_name).toBe("Acme");
    expect(body.organization_locations).toEqual(["United States"]);
    expect(result.action).toBe("organizations.search");
    expect(Array.isArray(result.organizations)).toBe(true);
    expect((result.organizations as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchOrganizations({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── organizations.enrich ─────────────────────────────────────────────────────

describe("enrichOrganization", () => {
  test("returns validated output without apiKey", () => {
    const result = enrichOrganization({ domain: "acme.com" });
    expect(result.action).toBe("organizations.enrich");
    expect((result.validated as { domain: string }).domain).toBe("acme.com");
  });

  test("throws when domain is missing", () => {
    expect(() => validateOrganizationsEnrichInput({})).toThrow("domain is required");
  });

  test("calls GET /api/v1/organizations/enrich?domain=...", async () => {
    const requests: Request[] = [];
    const result = await enrichOrganization({
      apiKey: "test_key",
      domain: "acme.com",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(organizationsEnrichFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/organizations/enrich");
    expect(url.searchParams.get("domain")).toBe("acme.com");
    expect(result.action).toBe("organizations.enrich");
    expect(result.organization).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(enrichOrganization({
      apiKey: "test_key",
      domain: "acme.com",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("surfaces the HTTP status and Apollo's error detail on rejection", async () => {
    const err = await enrichOrganization({
      apiKey: "bad_key",
      domain: "acme.com",
      fetch: async () => new Response(JSON.stringify({ error: "Api key required" }), { status: 422 }),
    }).then(() => { throw new Error("expected rejection"); }, (e) => e as { code: string; message: string });
    expect(err.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    expect(err.message).toContain("422");
    expect(err.message).toContain("Api key required");
  });

  test("surfaces a plain-text Apollo error body on rejection", async () => {
    const err = await enrichOrganization({
      apiKey: "bad_key",
      domain: "acme.com",
      fetch: async () => new Response("Invalid access credentials.", { status: 401 }),
    }).then(() => { throw new Error("expected rejection"); }, (e) => e as { code: string; message: string });
    expect(err.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    expect(err.message).toContain("401");
    expect(err.message).toContain("Invalid access credentials.");
  });
});

// ─── organizations.bulk_enrich ────────────────────────────────────────────────

describe("bulkEnrichOrganizations", () => {
  test("returns validated output without apiKey", () => {
    const result = bulkEnrichOrganizations({ domains: ["acme.com", "google.com"] });
    expect(result.action).toBe("organizations.bulk_enrich");
    expect((result.validated as { domains: string[] }).domains).toHaveLength(2);
  });

  test("throws when domains is missing", () => {
    expect(() => validateOrganizationsBulkEnrichInput({})).toThrow("domains is required");
  });

  test("calls POST /api/v1/organizations/bulk_enrich", async () => {
    const requests: Request[] = [];
    const result = await bulkEnrichOrganizations({
      apiKey: "test_key",
      domains: ["acme.com", "techco.io"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(organizationsBulkEnrichFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/organizations/bulk_enrich");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.domains).toEqual(["acme.com", "techco.io"]);
    expect(result.action).toBe("organizations.bulk_enrich");
    expect(Array.isArray(result.organizations)).toBe(true);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(bulkEnrichOrganizations({
      apiKey: "test_key",
      domains: ["acme.com"],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── organizations.job_postings ───────────────────────────────────────────────

describe("getOrganizationJobPostings", () => {
  test("returns validated output without apiKey", () => {
    const result = getOrganizationJobPostings({ id: "org_001" });
    expect(result.action).toBe("organizations.job_postings");
    expect((result.validated as { id: string }).id).toBe("org_001");
  });

  test("throws when id is missing", () => {
    expect(() => validateOrganizationsJobPostingsInput({})).toThrow("id is required");
  });

  test("calls GET /api/v1/organizations/{id}/job_postings", async () => {
    const requests: Request[] = [];
    const result = await getOrganizationJobPostings({
      apiKey: "test_key",
      id: "org_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(organizationsJobPostingsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/organizations/org_001/job_postings");
    expect(requests[0].method).toBe("GET");
    expect(result.action).toBe("organizations.job_postings");
    expect(Array.isArray(result.job_postings)).toBe(true);
    expect((result.job_postings as unknown[]).length).toBe(2);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getOrganizationJobPostings({
      apiKey: "test_key",
      id: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getOrganizationJobPostings({
      apiKey: "test_key",
      id: "org_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── contacts.create ──────────────────────────────────────────────────────────

describe("createContact", () => {
  test("returns validated output without apiKey", () => {
    const result = createContact({ first_name: "Alice", last_name: "Brown" });
    expect(result.action).toBe("contacts.create");
    expect((result.validated as { first_name: string }).first_name).toBe("Alice");
  });

  test("throws when first_name is missing", () => {
    expect(() => validateContactsCreateInput({ last_name: "Brown" })).toThrow("first_name is required");
  });

  test("throws when last_name is missing", () => {
    expect(() => validateContactsCreateInput({ first_name: "Alice" })).toThrow("last_name is required");
  });

  test("calls POST /api/v1/contacts", async () => {
    const requests: Request[] = [];
    const result = await createContact({
      apiKey: "test_key",
      first_name: "Alice",
      last_name: "Brown",
      email: "alice.brown@widgets.com",
      title: "Head of Procurement",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactCreateFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/contacts");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.first_name).toBe("Alice");
    expect(body.last_name).toBe("Brown");
    expect(body.email).toBe("alice.brown@widgets.com");
    expect(result.action).toBe("contacts.create");
    expect(result.contact).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createContact({
      apiKey: "test_key",
      first_name: "Alice",
      last_name: "Brown",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 422 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createContact({
      apiKey: "test_key",
      first_name: "Alice",
      last_name: "Brown",
      fetch: async () => new Response("{}", { status: 422 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── contacts.update ──────────────────────────────────────────────────────────

describe("updateContact", () => {
  test("returns validated output without apiKey", () => {
    const result = updateContact({ id: "con_001", title: "VP" });
    expect(result.action).toBe("contacts.update");
    expect((result.validated as { id: string }).id).toBe("con_001");
  });

  test("throws when id is missing", () => {
    expect(() => validateContactsUpdateInput({})).toThrow("id is required");
  });

  test("calls PUT /api/v1/contacts/{id}", async () => {
    const requests: Request[] = [];
    const result = await updateContact({
      apiKey: "test_key",
      id: "con_001",
      title: "VP of Procurement",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactUpdateFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/contacts/con_001");
    expect(requests[0].method).toBe("PUT");
    expect(result.action).toBe("contacts.update");
    expect(result.contact).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateContact({
      apiKey: "test_key",
      id: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateContact({
      apiKey: "test_key",
      id: "con_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── contacts.search ──────────────────────────────────────────────────────────

describe("searchContacts", () => {
  test("returns validated output without apiKey", () => {
    const result = searchContacts({ q_keywords: "Alice" });
    expect(result.action).toBe("contacts.search");
    expect(result.validated).toBeDefined();
  });

  test("calls POST /api/v1/contacts/search", async () => {
    const requests: Request[] = [];
    const result = await searchContacts({
      apiKey: "test_key",
      q_keywords: "Alice",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactsSearchFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/contacts/search");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.q_keywords).toBe("Alice");
    expect(result.action).toBe("contacts.search");
    expect(Array.isArray(result.contacts)).toBe(true);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchContacts({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── accounts.create ──────────────────────────────────────────────────────────

describe("createAccount", () => {
  test("returns validated output without apiKey", () => {
    const result = createAccount({ name: "Widgets Inc" });
    expect(result.action).toBe("accounts.create");
    expect((result.validated as { name: string }).name).toBe("Widgets Inc");
  });

  test("throws when name is missing", () => {
    expect(() => validateAccountsCreateInput({})).toThrow("name is required");
  });

  test("calls POST /api/v1/accounts", async () => {
    const requests: Request[] = [];
    const result = await createAccount({
      apiKey: "test_key",
      name: "Widgets Inc",
      domain: "widgets.com",
      industry: "Manufacturing",
      num_employees: 250,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(accountCreateFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/accounts");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.name).toBe("Widgets Inc");
    expect(body.domain).toBe("widgets.com");
    expect(body.num_employees).toBe(250);
    expect(result.action).toBe("accounts.create");
    expect(result.account).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createAccount({
      apiKey: "test_key",
      name: "Widgets Inc",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── accounts.update ──────────────────────────────────────────────────────────

describe("updateAccount", () => {
  test("returns validated output without apiKey", () => {
    const result = updateAccount({ id: "acc_001", num_employees: 300 });
    expect(result.action).toBe("accounts.update");
    expect((result.validated as { id: string }).id).toBe("acc_001");
  });

  test("throws when id is missing", () => {
    expect(() => validateAccountsUpdateInput({})).toThrow("id is required");
  });

  test("calls PUT /api/v1/accounts/{id}", async () => {
    const requests: Request[] = [];
    const result = await updateAccount({
      apiKey: "test_key",
      id: "acc_001",
      raw_address: "456 Industrial Blvd, Chicago, IL 60601",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(accountUpdateFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/accounts/acc_001");
    expect(requests[0].method).toBe("PUT");
    expect(result.action).toBe("accounts.update");
    expect(result.account).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateAccount({
      apiKey: "test_key",
      id: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateAccount({
      apiKey: "test_key",
      id: "acc_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── sequences.search ─────────────────────────────────────────────────────────

describe("searchSequences", () => {
  test("returns validated output without apiKey", () => {
    const result = searchSequences({ active: true });
    expect(result.action).toBe("sequences.search");
    expect((result.validated as { active?: boolean }).active).toBe(true);
  });

  test("calls POST /api/v1/emailer_campaigns/search", async () => {
    const requests: Request[] = [];
    const result = await searchSequences({
      apiKey: "test_key",
      q_keywords: "Q2 Outreach",
      active: true,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequencesSearchFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/emailer_campaigns/search");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.q_keywords).toBe("Q2 Outreach");
    expect(body.active).toBe(true);
    expect(result.action).toBe("sequences.search");
    expect(Array.isArray(result.sequences)).toBe(true);
    expect((result.sequences as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchSequences({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── sequences.add_contacts ───────────────────────────────────────────────────

describe("addContactsToSequence", () => {
  test("returns validated output without apiKey", () => {
    const result = addContactsToSequence({ emailer_campaign_id: "seq_001", contact_ids: ["con_001"] });
    expect(result.action).toBe("sequences.add_contacts");
    expect((result.validated as { emailer_campaign_id: string }).emailer_campaign_id).toBe("seq_001");
  });

  test("throws when emailer_campaign_id is missing", () => {
    expect(() => validateSequencesAddContactsInput({ contact_ids: ["con_001"] })).toThrow("emailer_campaign_id is required");
  });

  test("throws when contact_ids is missing", () => {
    expect(() => validateSequencesAddContactsInput({ emailer_campaign_id: "seq_001" })).toThrow("contact_ids is required");
  });

  test("calls POST /api/v1/emailer_campaigns/{id}/add_contact_ids", async () => {
    const requests: Request[] = [];
    const result = await addContactsToSequence({
      apiKey: "test_key",
      emailer_campaign_id: "seq_001",
      contact_ids: ["con_001"],
      send_email_from_email_account_id: "ea_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequencesAddContactsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/emailer_campaigns/seq_001/add_contact_ids");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.emailer_campaign_id).toBe("seq_001");
    expect(body.contact_ids).toEqual(["con_001"]);
    expect(body.send_email_from_email_account_id).toBe("ea_001");
    expect(result.action).toBe("sequences.add_contacts");
    expect(Array.isArray(result.contacts)).toBe(true);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(addContactsToSequence({
      apiKey: "test_key",
      emailer_campaign_id: "seq_001",
      contact_ids: ["con_001"],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── email_accounts.list ──────────────────────────────────────────────────────

describe("listEmailAccounts", () => {
  test("returns validated output without apiKey", () => {
    const result = listEmailAccounts({});
    expect(result.action).toBe("email_accounts.list");
    expect(result.validated).toEqual({});
  });

  test("calls GET /api/v1/email_accounts", async () => {
    const requests: Request[] = [];
    const result = await listEmailAccounts({
      apiKey: "test_key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailAccountsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/email_accounts");
    expect(requests[0].method).toBe("GET");
    expect(result.action).toBe("email_accounts.list");
    expect(Array.isArray(result.email_accounts)).toBe(true);
    expect((result.email_accounts as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEmailAccounts({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listEmailAccounts({
      apiKey: "bad_key",
      fetch: async () => new Response("{}", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── users.search ─────────────────────────────────────────────────────────────

describe("searchUsers", () => {
  test("returns validated output without apiKey", () => {
    const result = searchUsers({ q_keywords: "admin" });
    expect(result.action).toBe("users.search");
    expect((result.validated as { q_keywords?: string }).q_keywords).toBe("admin");
  });

  test("calls GET /api/v1/users/search with query params", async () => {
    const requests: Request[] = [];
    const result = await searchUsers({
      apiKey: "test_key",
      q_keywords: "admin",
      per_page: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(usersSearchFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/users/search");
    expect(url.searchParams.get("q_keywords")).toBe("admin");
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(result.action).toBe("users.search");
    expect(Array.isArray(result.users)).toBe(true);
    expect((result.users as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchUsers({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 403 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(searchUsers({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 403 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
