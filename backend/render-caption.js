/**
 * Render reference-style text onto an existing square image.
 *
 * Example:
 *   npm run render-caption -- content/backgrounds/example.png /tmp/out.png "take it slow," "no rush."
 */
import { readFile, writeFile } from "node:fs/promises";
import { overlayCaption } from "./motivational-generator.js";

function usage() {
  return `Usage:
  npm run render-caption -- <input-image> <output-image> "small phrase," "big phrase."
`;
}

async function main() {
  const [inputPath, outputPath, smallText, bigText] = process.argv.slice(2);
  if (!inputPath || !outputPath || !smallText || !bigText) {
    console.log(usage());
    process.exit(inputPath || outputPath || smallText || bigText ? 1 : 0);
  }

  const input = await readFile(inputPath);
  const output = await overlayCaption(input, { smallText, bigText });
  await writeFile(outputPath, output);
  console.log(`Rendered ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
