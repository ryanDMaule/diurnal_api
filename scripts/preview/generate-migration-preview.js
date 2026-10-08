import { generateOrValidatePreview } from "./migration-preview-tools.js";

const { mode, result } = await generateOrValidatePreview();
console.log(JSON.stringify({ mode, ...result }, null, 2));
