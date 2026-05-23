#!/usr/bin/env node
import assert from "node:assert/strict"
import { parse as parseCsv } from "csv-parse/sync"

function inspectDelimited(content, delimiter = ",") {
  const records = parseCsv(content, {
    bom: true,
    columns: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  })

  const headers = records.length > 0 ? Object.keys(records[0]) : []
  return { headers, records }
}

const quotedNewlines = inspectDelimited(
  'name,note\n"Widget A","line one\nline two"\n"Widget B",plain',
)
assert.equal(quotedNewlines.records.length, 2)
assert.equal(quotedNewlines.records[0].note, "line one\nline two")

const escapedQuotes = inspectDelimited('title,quote\n"Say ""hi""","ok"')
assert.equal(escapedQuotes.records[0].title, 'Say "hi"')

const tsv = inspectDelimited("region\tusers\nAPAC\t12\n", "\t")
assert.deepEqual(tsv.headers, ["region", "users"])
assert.equal(tsv.records[0].users, "12")

const bomCsv = inspectDelimited("\uFEFFid,value\n1,alpha\n")
assert.deepEqual(bomCsv.headers, ["id", "value"])

const empty = inspectDelimited("")
assert.equal(empty.records.length, 0)
assert.equal(empty.headers.length, 0)

console.log("CSV parser tests passed.")
