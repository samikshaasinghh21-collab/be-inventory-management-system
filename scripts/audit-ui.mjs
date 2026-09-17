import { ESLint } from "eslint";
const results = await new ESLint({ overrideConfig: { ignores: ["**/*.backup.jsx", "**/*.REDESIGN.jsx"] } }).lintFiles(["src"]);
const critical = results.flatMap(result => result.messages.filter(message => message.ruleId === "no-undef" || message.fatal).map(message => ({ file: result.filePath, line: message.line, message: message.message })));
console.log(JSON.stringify({ critical, errors: results.reduce((sum, result) => sum + result.errorCount, 0), warnings: results.reduce((sum, result) => sum + result.warningCount, 0) }, null, 2));
if (process.env.UI_LINT_DETAILS) console.log(JSON.stringify(results.filter(result => result.errorCount).map(result => ({ file: result.filePath, messages: result.messages.map(message => ({ line: message.line, rule: message.ruleId, message: message.message.split("\n")[0] })) })), null, 2));
process.exitCode = critical.length ? 1 : 0;
