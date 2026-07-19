import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readRepoFile = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8")

const [skill, header, readme, readmeEn] = await Promise.all([
  readRepoFile("skills/artifacta-publisher/SKILL.md"),
  readRepoFile("components/header.tsx"),
  readRepoFile("README.md"),
  readRepoFile("README-EN.md"),
])

const installCommand = "npx -y skills@latest add github:shl418/Artifacta --skill artifacta-publisher"
assert.match(skill, new RegExp(escapeRegExp(installCommand)))
assert.match(readme, new RegExp(escapeRegExp(installCommand)))
assert.match(readmeEn, new RegExp(escapeRegExp(installCommand)))
assert.match(skill, /\/settings\/api/)
assert.match(skill, /npx -y @artifacta\/cli@latest doctor/)

for (const staleInstruction of [
  "source-type presto",
  '--schedule "0 8 * * *"',
  "SYNC_URL_ALLOWLIST",
  "512MB",
]) {
  assert.equal(skill.includes(staleInstruction), false, `publisher skill still contains stale instruction: ${staleInstruction}`)
}

assert.match(header, /href="\/help"/)
assert.match(header, /aria-label=\{t\("nav\.help"\)\}/)

const cli = spawnSync(process.execPath, [path.join(repoRoot, "packages/cli/bin/artifacta.mjs"), "--help"], {
  encoding: "utf8",
})
assert.equal(cli.status, 0, cli.stderr)
assert.match(cli.stdout, /sync-scripts set/)
assert.doesNotMatch(cli.stdout, /artifacta sync trigger/)

console.log("Publisher onboarding contract tests passed.")

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
