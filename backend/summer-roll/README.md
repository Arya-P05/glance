# Summer roll

A new, isolated background studio at `http://localhost:8081/summer-roll`.

Start the service from `backend` with `npm run summer-roll`, and start the dashboard from `dashboard` with `npm run web`. The service listens on loopback port 3848. It reads `OPENAI_API_KEY` from `backend/.env`; the key never reaches the browser. `SUMMER_ROLL_MODEL` optionally overrides the default `gpt-image-1.5` model.

The page has 30 editable scenes adapted from the [shared conversation](https://chatgpt.com/share/6accde88-764c-83ea-b183-9d52269aa383). Its independent style guide fixes the camera treatment while varying activity, composition, lighting and energy. The scene library and guide live in `dashboard/features/summer-roll/guide.json`. The original reference image attachments were not available in the shared page; the implementation is based on the complete text conversation.

Each click generates one square 1024×1024 PNG using the Images API. Standard uses medium quality; High detail uses high quality. Generation uses the configured OpenAI account and incurs API usage. Images and their exact prompts, model, quality and status persist under the ignored `backend/content/summer-roll/` directory. Brief edits persist in browser local storage. A browser reload reconnects to active generation; a service restart marks interrupted jobs failed rather than silently retrying a paid request. Downloaded images contain no added text or grain processing.

There are no imports from the existing generation, prompts, taste, feedback, captions, job queue or Supabase modules. The only integration is a dashboard navigation entry. Nothing publishes to the existing library or to Instagram.

Run verification with `node --test summer-roll/summer-roll.test.js` from `backend` and `npx tsc --noEmit` from `dashboard`. Tests use a stub provider and temporary storage, without paid calls or production data. A live generation is needed to evaluate photographic fidelity.
