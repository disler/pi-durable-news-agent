# Pi Durable News Agent

> **This agent does not wait for you to work. It works for you, then waits, then keeps working.**
> A proactive news agent built on pi-durable that sorts every story into Hype, Facts and Signal with jev, on your Mac, an always-on Mac mini or a cloud VM.

📺 Watch this video to get the full breakdown of this codebase: **[Proactive Agents: a pi-durable agent that filters Hype, Facts and Signal on YouTube](https://youtu.be/OLqP8jxJ0Wc)**

<p align="center">
  <img src="images/01_durable_news_agent.png" alt="Pi Durable News Agent: news worth your attention" width="850">
</p>

In the age of AI there is exponentially more noise than signal: clickbait, overhyped launches and attention theft. As an engineer, your time and attention are your most important resources. This codebase is a **proactive agent** that guards them.

Every few minutes a cron tick wakes a durable agent. It checks 28 sources (news feeds, Hacker News, GitHub releases, benchmark blogs) and searches the last 7 days for 15 of your topics, lets jev throw out what is off topic or not worth a look, folds repeated coverage into one story, ranks the rest by importance and keeps the top 7, sends research subagents after the strongest items, scores each one as **Hype, Facts and Signal**, and renders it as a card it picks from a fixed component catalog. Then it waits. When it crashes, restarts or loses a provider call, it resumes from its last checkpoint and never pays twice for finished work. **News worth your attention, from an agent that does not need you to start it.**

---

## Install

### Agentic Install

```bash
claude "/install"          # Claude Code (or Pi, or your agentic coding tool) runs .claude/commands/install.md
```

The `/install` command checks Node 24 and `just`, installs the workspaces, confirms your keys are set without printing them, writes the two bearer tokens and runs the free test suites.

### Manual Install

**Prereqs:** [Node 24](https://nodejs.org), [`just`](https://github.com/casey/just), an [OpenRouter](https://openrouter.ai) key. Optional: an [OpenAI](https://platform.openai.com) key for card images when a source has none, a [Firecrawl](https://firecrawl.dev) key for richer page reads, `tmux` for the TUI smoke, Google Chrome for the UI suite.

```bash
just install                       # npm install for every workspace
cp .env.example .env               # then add OPENROUTER_API_KEY (and OPENAI_API_KEY if you want generated images)
just api tokens                    # writes DNA_CLIENT_TOKEN and DNA_CRON_TOKEN (prints names, never values)
just combos dev                    # free and offline: faux model, fixture news, UI on http://localhost:4851
just combos local                  # the real thing on this Mac: API, UI on http://localhost:4851, and the every minute tick
just net down local                # stop the API, the UI and the tick
```

---

## Why this exists

<p align="center">
  <img src="images/02_firehose_vs_filter.png" alt="The firehose goes into jev and only items worth your attention come out, ranked as Signal, Facts and Hype" width="800">
</p>

Agent news is a firehose. Every day brings releases, benchmarks, threads, launch posts and quote tweets, and most of it is hype dressed as signal. A chat assistant does not fix that, because a chat assistant waits for you. You have to remember to ask, decide what to ask, and read what comes back.

This codebase flips the relationship. Proactive agents do not wait for you to work. **They work for you, then wait.** When you are ready, you step in, pull out the value, give feedback, and move on. The agent runs on a schedule, on hardware you own or rent, with its work checkpointed in SQLite. It reads everything so you do not have to, uses jev as a cheap, fast judge on every item, and spends your attention only on what clears the bar. You teach it with two buttons and three labels.

> ***Proactive agent = durable agent + a trigger + a sandbox.***

Here the durable agent is a [pi-durable](https://www.npmjs.com/package/@earendil-works/pi-durable) news desk, the trigger is a cron tick, and the sandbox is whatever stays on: your Mac, an always-on Mac mini, or an exe.dev VM. **Execution is cheap. Judgement is priceless.**

---

## In, near, out of the loop

<p align="center">
  <img src="images/09_in_near_out_loop.png" alt="In loop: you prompt every step. Near the loop: a clock drives the agent while you stand beside it. Out loop: the clock and the agent run without you. An arrow labeled agentic engineering skill runs left to right" width="800">
</p>

The best engineers are moving from human **in** the loop, to human **near** the loop, to human **out** of the loop. In the loop, you prompt every step and the agent stops when you stop. Out of the loop, agents do 80% or more of the work on their own, but only once the right technology is in place, and jumping straight from in to out is a big step.

Proactive agents are the bridge. This news agent runs **near the loop**: a trigger drives it, it works without you, and you check in through the browser, the terminal or a chat message when you choose. **Scale your compute to scale your impact.**

---

## The whole system

<p align="center">
  <img src="images/10_whole_system.png" alt="Cron starts the news-desk agent inside the API; the agent runs a durable task that writes to SQLite; the browser (through the token-holding hub), the TUI and the CLI are clients" width="800">
</p>

The news agent runs inside `dna-server-api` on an always-on device, and the browser, the TUI and the CLI are **clients, not the server**. Refresh the page as often as you like: nothing is interrupted, because nothing runs in the page. The browser reaches the API through a hub that holds the token, so no secret ever reaches the page.

<p align="center">
  <img src="images/11_built_in_layers.png" alt="The API sits on durable-agent, which sits on pi-durable and SQLite; jev beside it; the browser, TUI, cron and CLI all sit on dna-sdk" width="800">
</p>

Three reusable packages in `apps/shared/packages/` carry the weight: `durable-agent` (the pi-durable harness, models, compaction, tools and subagents), `jev` (the classifier client, commands and policy) and `dna-sdk` (wire types, the route table, the capability list, the client and the stream reducers). The five apps are thin on top of them.

---

## How a sweep works

<p align="center">
  <img src="images/03_sweep_pipeline.png" alt="Cron tick, workflow route, durable sweep, research subagents, jev ranks, cards" width="800">
</p>

| Step | Who | What happens |
|---|---|---|
| Tick | `dna-server-cron` | One idempotent `POST /v1/workflows/news-sweep` every minute, with the cron token (the only token that can start work). The schedule (every 5 minutes by default, 1 to 60 or off, set from the top bar, the CLI or the agent) decides which ticks start a sweep |
| Sweep prompt | `news-desk` agent | `prompt_engineering/agents/news-desk/USER_PROMPT_news_sweep.md` lands in the agent's chat as a scheduled sweep |
| Gather | `dna.news-sweep` durable task | Every source that is due, skipped when its content hash has not changed. Then 15 topics drawn by weight, each searched over the last 7 days, newest first. Nothing older than 14 days. When nothing new turns up, a second draw of topics runs before the sweep ends empty |
| Gate | `dna.news-sweep` durable task | jev relevance and worth for every new item, publish dates read from the page when a feed has none |
| Dedupe | jev `same-story` | A new item that tells a story already on a card attaches to it as coverage or evidence, or extends its timeline as a new development. Only the latest release of a package keeps a card |
| Rank | jev `importance` | Importance × topic weight × source weight × freshness picks the top 7. Cards per sweep is 1 to 30 |
| Research | `news-researcher` subagents | Up to 4 children read and scrape the strongest items, check claims with jev, and report findings |
| Classify | jev `hfs` | Each candidate's excerpt plus its page text gets Hype, Facts and Signal scores |
| Present | `present_news`, `present_timeline` | Generative UI: the agent picks a component from an enum for each card; rules check it against the jev scores and send the fix back on failure |
| Collect links | `save_source` | Leads from your upvotes, and sites the agent finds worth following, become sources every future sweep fetches |
| Close | `complete_sweep` | An audit compares expected steps with what actually ran |

<p align="center">
  <img src="images/12_agent_decides_task_runs.png" alt="The agent calls run_news_sweep; the durable task runs gather, gate, dedupe and rank and hands back candidates; the agent renders cards" width="800">
</p>

**The agent decides, the task runs.** The agentic parts are the agent and its subagents: what to research, which component fits, which stories belong together. The deterministic parts are a durable task with checkpointed phases. Both survive restarts: a killed process resumes at the last checkpoint, and a replayed tool call never presents a card twice or creates a second subagent.

<p align="center">
  <img src="images/13_jev_at_every_gate.png" alt="jev judges at every gate: relevance and worth at the gate, same-story at dedupe, claim-support during research, hfs before presenting, at about $0.00004 a call" width="800">
</p>

jev judges at every gate, and ranks importance too, at about $0.00004 a call, so the model only ever sees what survived.

---

## Hype, Facts and Signal

<p align="center">
  <img src="images/04_hfs_ranking.png" alt="jev ranks one item: Signal 91, Facts 84, Hype 7" width="780">
</p>

| Label | Means | Example |
|---|---|---|
| **Hype** | Attention and growth driven by excitement, not substance: the topic grabs attention by its nature | "This changes everything" with no release date |
| **Facts** | Objectively true. Close to signal, but a fact you cannot act on is not that useful | A lab publishes a large set of math proofs |
| **Signal** | Information you can act on right now, if you want to | A CLI you use changes a default; here is the flag to turn it off |

jev scores all three instead of picking one, because real items mix: hype and facts, facts and signal, rarely hype and signal, and sometimes all three. That is why the `hfs` command uses jev's **score** type, not its **choice** type. Facts is judged on the article's page text, not only the feed excerpt, so a primary source with code, numbers or a release scores high and a secondhand report scores low.

**Show me more** and **Show me less** move topic weights and the weight of the card's source, and a card you vote down leaves News. Labeling a card Hype, Facts or Signal moves the keywords for that section, and your recent labels become few-shot examples in jev's next decisions. When jev sees hype and signal without facts, the agent asks you directly.

jev commands live as JSON in `apps/dna-server-api/prompt_engineering/jev/<command>/command.json`: `relevance`, `worth-attention`, `importance`, `hfs`, `same-story`, `claim-support`.

---

## Search that keeps working

<p align="center">
  <img src="images/14_one_stream_shared_state.png" alt="One /v1/stream of snapshots and deltas feeds the same dna-sdk reducer in the browser, the TUI and the CLI" width="800">
</p>

Search is free by default and needs no key. Every engine sits in a chain, and an engine that fails or answers with a captcha page instead of a feed rests for 2 minutes, doubling up to 30, while the next one answers.

| Search | Chain |
|---|---|
| **Sweep topics and `search_web`** | Firecrawl first when `DNA_SEARCH_MODE=firecrawl` and a key is set (inside per sweep and daily credit caps), then Bing News RSS, then Google News RSS when Bing fails or finds nothing. Hacker News and the local cache always run beside them. Results merge, dedupe by url and sort newest first |
| **Deep research (`deep_search`)** | Firecrawl when a key is set, then Bing web, then DuckDuckGo, plus the news chain |
| **Page reads (`scrape_url`, `open_page`, `hyper_fetch`)** | Firecrawl when a key is set, otherwise (or when it fails) a direct fetch read with Readability. `hyper_fetch` saves the whole page and reads it chunk by chunk |
| **Sources** | RSS and Atom, Hacker News, GitHub releases and listing pages, each on its own interval. A 403 or 429 skips a source for one sweep and never disables it |

`dna doctor` and `dna status` show each engine's health, and `/v1/info` carries it for every client.

---

## Three clients, one API

<p align="center">
  <img src="images/05_three_clients.png" alt="Browser, TUI and CLI all talk to dna-server-api through one capability list" width="780">
</p>

`apps/shared/packages/dna-sdk/src/capabilities.ts` lists 26 capabilities: read and search the feed, give feedback, answer taste questions, chat, steer, stop, pick the model, set the sweep schedule and the cards per sweep, move the compaction points, compact, edit keywords, sources and source weights, and read every sweep, run, tool call, cost and log line. **A test fails if the browser, the TUI or the CLI is missing any of them.** Every client reads one server-sent stream, `/v1/stream`: a snapshot, then deltas, through the same `dna-sdk` reducers.

The agent can drive the same actions from chat with its 24 tools: vote and label cards, boost or lower a topic or a source, open a search tab in your browser, scroll to a card and highlight it, link cards into a timeline, change the schedule, read a full article, and start a background deep research that runs 1 to 5 subagents and posts each answer back as it finishes.

<p align="center">
  <img src="images/08_browser_live.png" alt="The browser: news cards with their Hype, Facts and Signal scores on the left, the agent with every tool call on the right" width="800">
</p>

| Client | Start it | Notes |
|---|---|---|
| **Browser** | `just combos local`, or `just browser start [device]` | Vue 3 and Vite behind a hub that holds the token. News on the left, newest published first by default. Sort by publication date or date added, in either direction, across news, search and timeline tabs. Unread cards have an accent border and badge; clicking anywhere in a card marks it viewed. Reading state and sorting are saved in this browser for each device. A rail of publish time, H/F/S icon and keyword sits beside each card. The agent is on the right. The top bar sets the schedule and the cards per sweep and shows total spend. Executions shows every sweep and chat with its tool calls, subagents, timings, tokens and cost |
| **TUI** | `just tui attach [device]` | pi-tui with slash commands (`/feed`, `/more 3`, `/label 3 signal facts`, `/runs`, `/tools`). Plain text goes to the agent |
| **CLI** | `just cli run <command>` | `dna status`, `dna feed`, `dna send "..."`, `dna watch`, `dna doctor`. Every command has `--json` |

---

## Your Mac, a Mac mini, or a VM

<p align="center">
  <img src="images/06_device_matrix.png" alt="Same code on three devices: the laptop runs the API and the clients, a Mac mini and an exe.dev sandbox run the API and a cron line" width="800">
</p>

The same code runs everywhere. Without a `dna-network.yaml`, only `local` exists. Copy `dna-network.example.yaml` to `dna-network.yaml` and uncomment a device to add one. `just net up <device>` provisions Node 24, syncs the repo, writes `.env` over ssh stdin (mode 600), installs the API and UI services and the crontab line, waits for health and probes the token scopes.

| Device | How it runs | Reached at |
|---|---|---|
| **local** (this Mac) | `just combos local`: the API and the UI as background processes, plus the every minute crontab line. `just net down local` stops all three | `http://127.0.0.1:4850`, UI at `http://localhost:4851` |
| **mini** (an always-on Mac mini over ssh) | launchd services `dev.dna.api` and `dev.dna.hub`, plus the crontab line. Turn on Remote Login and copy your ssh key first | `http://your-mac-mini.local:4850`, UI on `:4851` |
| **linux** (any box with ssh and sudo) | systemd `dna-api` and `dna-hub`, plus the crontab line | your host, or an ssh tunnel |
| **vm** (an exe.dev VM) | `just net up vm` creates the VM, then deploys like a Linux box | ssh tunnel to `http://127.0.0.1:4852`; the UI at its private `https://<vm>.exe.xyz` |

### What a sweep costs

Measured through OpenRouter with Claude Haiku 5.5 in free web search mode:

| Item | Measured |
|---|---|
| The first sweep of a new install | about $0.32 and 7 minutes: every source is new, so jev reads about 3,000 items |
| A sweep with news after that | about $0.0065 (model and jev), 2 to 7 cards, under a minute |
| A sweep with nothing new | about $0.003: unchanged sources are skipped by their content hash |
| jev | about $0.00004 a call |
| Generated card images (OpenAI, only when a source has none) | about $0.005 each |
| Search | free: Bing News, Google News, Hacker News, direct feeds |

Almost all model spend is the agent re-reading its chat on every tool turn, so it grows with the chat. Pick 15 or 30 minutes in the top bar to spend less, or compact the chat.

---

## Durability

<p align="center">
  <img src="images/07_restart_resume.png" alt="A sweep's checkpoints, a restart in the middle, and the sweep completing with no duplicate cards" width="780">
</p>

<p align="center">
  <img src="images/15_where_state_lives.png" alt="On the device, agent.sqlite holds the agent's conversations and checkpoints; a projector copies telemetry into dna.sqlite, which also holds items and cards that the sweep and tools write; clients read from it" width="800">
</p>

State lives in two SQLite files on the device. `agent.sqlite` belongs to pi-durable: conversations and checkpoints. `dna.sqlite` belongs to the app: items, cards, stories, sources, keywords, sweeps, and telemetry that a projector copies out of the agent's events. Clients only ever read through the API.

These are tested, not promised:

- `apps/dna-server-api/tests/recovery.test.ts` SIGKILLs the server in the middle of the jev gate. The restarted server resumes at the last chunk, pays jev once per item and presents each card once.
- `apps/shared/tests/live/restart.mjs <device>` restarts a device's service while the real agent is mid sweep. The sweep completes and the audit stays clean.
- Tool calls that create a task or a subagent run once per tool task, so a replay finds the same child instead of creating another.
- The provider, jev, search and image calls retry with backoff, and the cron tick retries at 2 s, 8 s and 30 s.
- One bad run never blocks the schedule. A sweep whose run ends without `complete_sweep` closes as stalled at once, and a sweep queued behind a failed run is withdrawn, so the next tick starts fresh.

---

## Folder structure

```
pi-durable-news-agent/
├── package.json                 # the npm workspace root: every app in apps/ and apps/shared/packages/*
├── shared-app-configuration/    # tsconfig.base.json and the formatter config every app shares
├── apps/
│   ├── dna-server-api/          # Express API: agents, tools, sweep task, search, telemetry, SSE, auth scopes
│   │   ├── src/agents/          # news-desk, news-researcher, deep-research, one file per tool, the faux script
│   │   ├── src/news/            # sources, the search chain, jev judge, stories, images, timelines, sweep task
│   │   ├── src/db/migrations/   # 001_schema.sql, the whole schema
│   │   ├── prompt_engineering/  # agents/<agent>/ prompts, jev/<command>/command.json, images/news-card
│   │   ├── config/              # default sources and keywords
│   │   ├── deploy/              # launchd plist and systemd unit templates
│   │   └── tests/               # faux sweep, crash recovery, search chain, auth, stream, executions, settings
│   ├── dna-server-cron/         # the 1 minute tick and crontab management (bin/dna-cron.sh)
│   ├── dna-cli/                 # the dna command, doctor, and the local, ssh and exe.dev drivers
│   ├── dna-client-browser/      # hub/ (token holding proxy) and fe/ (Vue 3 app), Playwright suite
│   ├── dna-client-tui/          # pi-tui client, slash commands, tmux smoke
│   └── shared/
│       ├── packages/
│       │   ├── durable-agent/   # reusable pi-durable foundation: harness, models, compaction, tools, subagents
│       │   ├── jev/             # reusable jev foundation: client, commands, policy, ledger
│       │   └── dna-sdk/         # wire types, route table, capabilities, client, reducers, logger
│       └── tests/               # live/e2e.mjs and live/restart.mjs against real devices, docs.mjs
├── just/                        # one mod.just per group: api cron browser tui cli net test combos
├── images/                      # README images
└── dna-network.example.yaml     # the devices; copy to dna-network.yaml
```

---

## Commands

```bash
just combos dev                    # faux API plus UI with hot reload, free and offline
just combos local                  # this Mac, always on: API, UI and the every minute tick
just net down local                # stop the API, the UI and the tick on this Mac
just api run                       # the API alone on :4850
just cron tick                     # one sweep now, the exact path the crontab runs
just browser start [device]        # the UI against a device
just tui attach [device]           # the TUI against a device
just cli run doctor                # Node, keys, API, scopes, cron, each search engine's health
just net status                    # every device: online or not, its API link and its UI link
just net up mini                   # provision, deploy, env, services, cron, wait, probe
just net deploy mini               # ship new code to a device that is already set up
just net step tcc mini             # check macOS privacy for launchd and cron
just net up vm                     # create an exe.dev VM and deploy to it
just net tunnel vm                 # the ssh tunnel to a private VM
just net destroy vm                # delete the exe.dev VM (asks for its name)
just combos remote mini            # bring a device up, then run the live end to end checks
just test unit                     # types, lint, format, unit tests (free)
just test faux                     # faux sweep, recovery, scopes, stream (free)
just test ui                       # Playwright suite against a faux API (free)
just test live local               # live end to end on a device (real spend)
```

---

## Where it can still fail

- **macOS privacy.** Cron cannot read `~/Documents`, `~/Desktop` or `~/Downloads` without Full Disk Access. The default `code_dir` is `~/pi-durable-news-agent` for that reason. If you keep the repo elsewhere, `just net step tcc <device>` runs the tick's exact path under cron and tells you what to add (`/usr/sbin/cron`).
- **Writing a crontab on macOS** can raise an "administer your computer" prompt. Run `just combos local` from a terminal you can approve it in.
- **Free search is rate limited, not metered.** Bing can answer with a captcha and reddit can answer 403. The chain rests that engine and keeps going, and `dna doctor` shows which engines are resting. Set `FIRECRAWL_API_KEY` and `DNA_SEARCH_MODE=firecrawl` for paid search with credit caps.
- **The first sweep is the expensive one.** Every source is new, so jev reads thousands of items. Later sweeps skip unchanged sources.
- **A slow model at a large context times out.** A provider that keeps timing out ends the agent's run, so that sweep closes as stalled and the next tick starts fresh. Compact the chat or pick a faster model when it repeats.
- **A Mac mini's UI is open to your network** when its entry has a `ui`. Anyone on your Wi-Fi can read and steer the agent. Remove `ui` from its entry in `dna-network.yaml` and redeploy to keep it private, then use `just browser start mini` on your laptop.
- **A private VM needs its tunnel for the CLI and TUI.** `just net tunnel vm` before they talk to it. Its UI needs no tunnel: the `exe.xyz` URL serves it behind the exe.dev login.
- **The model can still choose badly.** Component rules, the audit and the taste questions catch most of it. They do not make it infallible.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Want To Master Agentic Engineering?

<p align="center">
  <img src="images/16_the_next_leap_is_coming.png" alt="The Next Leap Is Coming: Phase 1 Augment, Phase 2 Automate, and a red question mark before Phase 3 Deprecate" width="800">
</p>

The next leap for engineers is coming soon.

Join the [Early Sign-Up](https://agenticengineer.com/ia3-pre-launch?y=durnwag).

Follow the [IndyDevDan YouTube channel](https://www.youtube.com/@indydevdan) to improve your agentic coding advantage.

---

Stay Focused and Keep Building

- IndyDevDan
