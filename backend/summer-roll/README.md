# Summer roll

A new, isolated background studio at `http://localhost:8081/summer-roll`.

Start the service from `backend` with `npm run summer-roll`, and start the dashboard from `dashboard` with `npm run web`. The service listens on loopback port 3848. It reads `OPENAI_IMAGE_API_KEY` from `backend/.env`; the key never reaches the browser. `SUMMER_ROLL_MODEL` optionally overrides the default `gpt-image-1.5` model.

The page has 30 editable scenes adapted from the [shared conversation](https://chatgpt.com/share/6accde88-764c-83ea-b183-9d52269aa383). Its independent style guide fixes the camera treatment while varying activity, composition, lighting and energy. The scene library and guide live in `dashboard/features/summer-roll/guide.json`. The original reference image attachments were not available in the shared page; the implementation is based on the complete text conversation.

Each click generates one square 1024×1024 PNG using the Images API. Standard uses medium quality; High detail uses high quality. Generation uses the configured OpenAI account and incurs API usage. Images and their exact prompts, model, quality and status persist under the ignored `backend/content/summer-roll/` directory. Brief edits persist in browser local storage. A browser reload reconnects to active generation; a service restart marks interrupted jobs failed rather than silently retrying a paid request. Downloaded images contain no added text or grain processing.

Finished frames have a “Send to Backgrounds” action. It copies the original PNG into the shared image asset store and creates a pending background with the original scene, prompt, model and Summer Roll provenance. The usual background review and caption flow then applies. Repeated clicks and retries reuse the same background without resetting its review status; successful sends automatically remove the frame from the roll while retaining local files and the import receipt. Previously sent frames are also hidden when the service starts. Supabase backend credentials are required for this action. Nothing is automatically published to the library or Instagram.

Run verification with `node --test summer-roll/summer-roll.test.js` from `backend` and `npx tsc --noEmit` from `dashboard`. Tests use a stub provider and temporary storage, without paid calls or production data. A live generation is needed to evaluate photographic fidelity.

Use “Remove from roll” on finished or failed frames to hide them persistently. Local files are retained, and any copy sent to Backgrounds stays in the regular workflow. Frames cannot be removed while generating or being sent.
