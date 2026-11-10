# Voice spike findings (10 November 2026)

Tested with `ai@7.0.169`, `@ai-sdk/react@4.0.173`, `@ai-sdk/gateway@4.0.142`, model `openai/gpt-realtime-2.1` through Vercel AI Gateway.

**How it was tested.** Headless Chromium with a fake microphone playing pre-recorded synthetic receptionist speech, driving the real app against the real gateway. No human has yet spoken to it through a headset, and nothing has been tested from the practice network.

| Question | Result |
|---|---|
| Does the gateway's realtime beta give transcripts of both sides? | Yes. `input-transcription-completed` arrives for every trainee turn and `audio-transcript-done` for every caller turn. No need to connect to OpenAI directly. |
| Does the caller speak first? | Yes, with the scenario's opening line, after the app sends one `response-create` on connect. |
| Is transcript order right? | Yes, across two full calls (11 and 8 turns). |
| Latency | 0.68 to 0.98 seconds from the gateway's "speech stopped" event to the first audio coming back, over 8 turns. Measured from a cloud sandbox, so it excludes the practice network and the turn-detection silence window the trainee also waits through. |
| Does the caller hold back hidden facts? | Scenario 3: said only "I've used quite a lot of it" until asked how he felt, then gave the chest tightness, then timing and spray only when asked. In the call that never asked, they never came out. |
| Scenario 3, missed chest pain | Debrief marked "Unsafe outcome", outcome incorrect, red flag 0/2, score 43%. |
| Scenario 3, handled well | Outcome correct, red flag handled, score 100%. |
| WebSocket blocked? | Not from the test environment. Practice network still untested. |

## Still open

- **Voice.** Using `alloy` (the documented default) with the accent set in the prompt. Nobody has listened to it. Other voices can be tried with the `REALTIME_VOICE` env var, no code change.
- **Low reasoning effort.** The installed SDK docs do not name a session option for it, so it is not set. Latency is already inside the target without it. If a key is found it can be supplied as JSON in `REALTIME_PROVIDER_OPTIONS`.
- **Barge-in** (talking over the caller) was not tested.
- **Scenarios 1, 2 and 4** have not been run by voice. Scenario 4 depends on tone, which synthetic speech cannot test.

## Debrief model (updated after Anthropic models were enabled)

Each model scored the same two scenario 3 transcripts (chest pain missed, and handled well).

| Model | Missed call | Good call | Time per debrief |
|---|---|---|---|
| `openai/gpt-5-mini` | 43%, unsafe | 100% | 25 to 36 s |
| `anthropic/claude-sonnet-5.5` | 29%, unsafe | 79% | 8 to 9 s |
| `anthropic/claude-opus-5.5` | 29%, unsafe | 86% | 9 to 12 s |

`anthropic/claude-sonnet-5.5` is now the debrief model. It is stricter than gpt-5-mini (which gave the good call full marks despite no safety-netting) and three to four times faster.

- Both Anthropic models at first suggested advice outside the answer key ("stay seated", "don't drive yourself"). The debrief prompt now forbids improvements that are not in the rubric or answer key; in three re-runs none appeared.
- Scores vary between runs. The same good call scored 79% and 86% on consecutive Sonnet runs, differing on whether "checks who is calling and for whom" was met. Treat a score as a guide, not a measurement.
- This is two transcripts from one scenario.
