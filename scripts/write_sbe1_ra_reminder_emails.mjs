import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const inputPath = resolve(process.argv[2] || '')
const outputDir = resolve(process.argv[3] || 'SBE1_RA_Reminder_Emails')
if (!process.argv[2]) throw new Error('Pass the generated reminder JSON file as the first argument.')

const result = JSON.parse(readFileSync(inputPath, 'utf8'))
mkdirSync(outputDir, { recursive: false })

const slug = value => String(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const summary = [
  '# SBE-1 RA Reminder Email Summary',
  '',
  `Generated: ${result.generatedAt}`,
  `Pending RA parts: ${result.totalPendingParts}`,
  `Affected PCNs: ${result.totalPendingPcns}`,
  `Email drafts: ${result.emails.length}`,
  '',
  '| SBE-1 | Recipient | Pending parts | Affected PCNs | File |',
  '| --- | --- | ---: | ---: | --- |'
]

for (const email of result.emails) {
  const filename = `SBE1_RA_Reminder_${slug(email.sbe1Name)}.eml`
  const eml = [
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    email.html
  ].join('\r\n')
  writeFileSync(resolve(outputDir, filename), eml)
  summary.push(`| ${email.sbe1Name} | ${email.to} | ${email.pendingPartCount} | ${email.pendingPcnCount} | ${filename} |`)
}

if (result.missingChampionEmails.length) {
  summary.push('', '## Missing champion email addresses', '')
  for (const item of result.missingChampionEmails) {
    summary.push(`- ${item.sbe1Name}: ${item.pendingPartCount} pending RA part${item.pendingPartCount === 1 ? '' : 's'}`)
  }
}

writeFileSync(resolve(outputDir, 'SUMMARY.md'), `${summary.join('\n')}\n`)
console.log(JSON.stringify({ outputDir, emailFiles: result.emails.length, missingChampionEmails: result.missingChampionEmails.length }, null, 2))
