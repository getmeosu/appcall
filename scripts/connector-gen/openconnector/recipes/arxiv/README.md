# arXiv

**HOLD.** The official arXiv query API at `https://export.arxiv.org/api/query` is unauthenticated and returns Atom 1.0 XML. Native templates require `responseFormat: json` and cannot express the pinned XML parse. There is no official JSON edition. This recipe is not admitted.

Documented operations (not admitted) would GET `https://export.arxiv.org/api/query`:

- `healthcheck` / `papers.search`: `search_query` plus optional paging/sort
- `papers.get`: `id_list`
- `papers.recent.list`: `search_query=cat:{category}&sortBy=submittedDate`

Native category is `utility` (source Data). No API key is issued.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://info.arxiv.org/help/api/user-manual.html. Fixtures are independently derived and do not represent live provider access.
