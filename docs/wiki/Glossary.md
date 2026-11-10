# Glossary

| Term | Meaning |
|---|---|
| **Advisory** | One issued forecast of a storm (track and intensity), named by its issue time `YYYYMMDDHH` UTC. Each advisory is one REF model run |
| **Analysis mode** | The top-level switch: Forecast (REF), Post Disaster Analysis, Scenarios, History |
| **Anuj's API / shared API** | `pacific-disaster-api.spc.int`, the Partner API the live dashboard reads |
| **Base path** | `/partner2`, the URL prefix in production; add it with `prependBasePath` |
| **Best track** | The post-event, authoritative track of a storm; drives PDIE |
| **Country code** | `VU`, `WS`, `TO`, `CK` (`CountryCode`); generated from `config/` |
| **Event** | One storm in one country, or a planning-scenario set; holds model runs |
| **Event kind** | `forecast`, `observed` or `scenario`, from the event type's name (`eventTypeKind`) |
| **Fallback event** | A curated event in `config/events/` shown when the API has none |
| **Forecast track** | An official SPC/RSMC Nadi forecast; drives REF |
| **GEM** | The SPC division behind `gemthreddshpc` (THREDDS) and `opmthredds.gem` (the server) |
| **Middleware** | The Django Partner API in `middleware/` (our copy) |
| **Model run** | One execution of a model; links a track, result files and hazards |
| **PDIE** | Pacific Disaster Impact & Exposure: the RiskScape damage and loss model run on the best track |
| **pdna** | The name of the on-prem pipeline that runs the PDIE model on best tracks (`setup_tc_pipelines`) |
| **Planning scenario** | A hazard at a return period and sea-level rise, with its losses |
| **Proxy route** | `/api/partner-proxy/[...path]`, through which the browser reaches the API and THREDDS |
| **`proxy.ts`** | Next 16's request proxy (was `middleware.ts`): routing, auth gate, tenant lock |
| **REF** | Rapid Exposure Forecast: RiskScape model counting what lies inside forecast wind bands |
| **Regional impact** | One area's numbers within an event |
| **Return period** | The average interval between events of that size (e.g. 100-year) |
| **Risk information** | One result file on the API (a table or a map) |
| **RiskScape** | The risk modelling platform the models run on (`riskscape.nz`) |
| **SLR** | Sea-level rise, in metres, of a scenario |
| **Strict country** | A country that never falls back to local files |
| **Tenant lock** | `TENANT_COUNTRY`: one deployment serves one country |
| **THREDDS** | `gemthreddshpc.spc.int`, which serves static hazard layers as WMS |
| **Wasabi** | The S3-compatible bucket holding the hazard zarr store and scenario losses |
| **Wind bands** | Gale 63–88, Storm 89–117, Hurricane 118+ km/h; "Possible …" means inside the uncertainty cone |
| **Zarr** | Chunked array format for the flood-depth catalogue |
