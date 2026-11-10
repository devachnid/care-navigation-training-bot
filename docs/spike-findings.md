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
- **Debrief model.** The gateway key is on Vercel's free tier, which refuses the stronger text models (all Anthropic models tried returned "Free tier users do not have access"). Testing used `openai/gpt-5-mini`, which took 25 to 36 seconds per debrief and marked generously. A stronger model needs paid gateway credit.
