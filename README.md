# RareAtlas: an evidence atlas and community layer for rare diseases

Hack-Nation 7th Global AI Hackathon · Challenge 05: AI Atlas for the World's Rare Diseases

**Live prototype:** <https://rareatlas.lovable.app>
**Team video + 1-minute walkthrough:** <PASTE VIDEO LINK>

## The idea

A newly diagnosed family searches for their disease and usually finds either nothing or dense journal abstracts. RareAtlas does two things:

1. **Shows sourced connections.** Search a disease, gene or mechanism and see a graph of how it connects to genes, variants, mechanisms, patient organizations, registries and research. Every connection shows its source link, whether it is *observed* (published) or *inferred* (hypothesis), a confidence level, and the uncertainty.
2. **Never dead-ends.** If there is no entry, RareAtlas says so clearly and lets the person start a new Atlas entry and community, so the next person with the same condition can find and join it.

AI is the explainer and assistant, not a diagnosis tool.

## Demo journey (one complete path)

1. Search **DIPG** (a pediatric brain tumor with no effective therapies) or **FOP**.
2. The atlas shows that DIPG tumors and FOP share the same gene, **ACVR1**, and several of the same mutations. This link is shown as a dashed bridge because it is *observed* as a shared mutation, but whether FOP treatments help DIPG is *unproven*.
3. The atlas surfaces what already exists on the FOP side: a patient-run registry (IFOPA), natural history data, approved treatments, and ALK2 inhibitor trials.
4. The last card gives a concrete next step a patient group could take this week, and states plainly what is still unknown.

## Architecture

```text
Lovable frontend (React)
   |  curated graph data (sourced)      -> rendered as graph + evidence cards
   |  communities                        -> Firebase Firestore (Spark plan)
   |  AI explanation / entry drafting    -> POST JSON
   v
Cloudflare Worker "rare-atlas-ai"        (holds the API key as an encrypted secret)
   v
OpenRouter  ->  openai/gpt-6-luna        (OpenAI model)
```

- **Frontend:** Lovable (React). Search, graph view, connection cards, evidence-path, communities.
- **Database:** Firebase Firestore, `communities` collection. The document ID is a normalized, URL-safe slug of the condition name, so the same community cannot be created twice. Joining increments `memberCount`.
- **AI proxy:** a Cloudflare Worker that validates input, restricts requests to Lovable origins, calls OpenRouter, and returns clean JSON. The API key never appears in frontend code. Two modes: `answer` (plain-language explanation) and `draft` (structured suggestions for a new Atlas entry).
- **Model:** `openai/gpt-6-luna`, routed through OpenRouter.

### Where OpenAI is used

- **Explain:** turns a condition and its known connections into plain language a family can follow, with a fixed safety note.
- **Draft:** helps someone start a new Atlas entry by suggesting related terminology, a neutral title and summary, and questions that help others recognize the same condition.

The system prompt forbids diagnosis, treatment advice and invented facts, and tells the model to say when it has no evidence.

## Reproducing the dataset

The graph is a **curated, sourced slice**, not an automated crawl. It lives in one data file in the frontend: `<PASTE DATA FILE PATH FROM LOVABLE>`.

Each connection has: label, plain-language description, `Observed` or `Inferred`, confidence, optional uncertainty, and source links. To add a disease, add an entry with the same fields and at least one source URL. Connections without a source are labeled "Unsourced - hypothesis" and drawn dashed.

Sources used for the FOP / DIPG slice:

| Connection | Sources |
|---|---|
| FOP and ACVR1 (ALK2), variant R206H | PMC6706059, PMC6680371 |
| R206H makes the receptor respond to activin A | Science Translational Medicine paper (bvsalud record mdl-26333933), PMC6706059 |
| Same gene altered in DIPG | Nature Genetics 2014 (Oxford ORA record), PMC7888549, openlabnotebooks.org write-up |
| Patient registry and natural history data | ClinicalTrials.gov NCT02745158 (via trials.arthritis.org), IFOPA |
| Treatments and trials | Garetosmab approval coverage, ClinicalTrials.gov NCT05394116, FOP Friends tracker |

Retrieval date for all sources: 2026-10-04.

## Run it yourself

1. Clone this repo, then `npm install` and `npm run dev`.
2. Create a Firebase project (Spark plan), enable Firestore, and put the web config in the frontend's Firebase config file. Firestore is in test mode for the hackathon.
3. Deploy the Worker in `worker/index.js` to Cloudflare, and add a secret named `OPENROUTER_API_KEY`. Set the Worker URL in the frontend.
4. The OpenRouter key needs a small credit balance because the model is paid (cents per thousand requests).

## Honest limits

- The graph covers a **focused slice** (FOP, Fabry, and the DIPG bridge). Other searches get an AI explanation and the community path, not a graph.
- AI does not yet extract edges from papers automatically. The current edges are curated by hand from the listed sources. Automated extraction, name reconciliation across vocabularies (OMIM, HPO, MONDO) and graph clustering are the next steps.
- The FOP to DIPG link is a **hypothesis for expert review**. It shows a shared mutation, not proof that FOP treatments help DIPG. Treatment approvals and trial statuses change quickly, so check the sources.
- **The 10x claim is an assumption, not a result.** The idea is that reusing an existing registry and study design, instead of building new ones from scratch, could shorten study set-up. The size of that speed-up needs validation.
- AI answers can be wrong and should be checked. This is not medical advice or a diagnostic tool.
- Firestore rules are in test mode and must be tightened before any real use.
