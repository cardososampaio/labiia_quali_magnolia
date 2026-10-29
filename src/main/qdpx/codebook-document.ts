/**
 * Opens a codebook written in a text document and returns its paragraphs
 * with the marks the outline rules read (headings, whole-line bold, lists).
 *
 * Supported: Word (.docx), OpenDocument (.odt), Rich Text (.rtf), Markdown
 * (.md) and the old Word format (.doc). A .doc is a closed binary format, so
 * it is first converted to .docx with Microsoft Word, or with LibreOffice
 * when Word is not installed; without either, the person is asked to save
 * the file as .docx. The file's first bytes decide the format, because
 * documents are often renamed (an .rtf saved as .doc, a .docx as .doc).
 */
import { readFile, mkdtemp, rm, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, basename, extname } from 'path'
import { execFile } from 'child_process'
import type { OutlineParagraph } from '../../renderer/models/types'
import { readDocxParagraphs } from './codebook-docx'
import { readOdtParagraphs } from './codebook-odt'
import { readRtfParagraphs } from './codebook-rtf'
import { readMarkdownParagraphs } from './codebook-md'
import { t } from '../../renderer/i18n'

export const CODEBOOK_DOCUMENT_EXTENSIONS = ['docx', 'doc', 'odt', 'rtf', 'md', 'markdown']

export class CodebookDocumentError extends Error {}

function run(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 120_000, windowsHide: true, env: { ...process.env, ...env } }, (err) => (err ? reject(err) : resolve()))
  })
}

// Word's own converter, through its automation interface. Paths travel in
// environment variables so no quoting can break the script.
const WORD_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$w = New-Object -ComObject Word.Application',
  '$w.Visible = $false',
  '$w.DisplayAlerts = 0',
  'try {',
  '  $d = $w.Documents.Open($env:LABIIA_IN, $false, $true, $false)',
  '  $d.SaveAs2($env:LABIIA_OUT, 16)',
  '  $d.Close($false)',
  '} finally { $w.Quit() }'
].join('; ')

function sofficePaths(): string[] {
  const roots = [process.env.ProgramFiles, process.env.ProgramW6432, process.env['ProgramFiles(x86)']].filter(Boolean) as string[]
  return [...roots.map((r) => join(r, 'LibreOffice', 'program', 'soffice.exe')), '/usr/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']
}

async function convertDocToDocx(path: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'labiia-codebook-'))
  try {
    const out = join(dir, basename(path, extname(path)) + '.docx')
    if (process.platform === 'win32') {
      try {
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WORD_SCRIPT], { LABIIA_IN: path, LABIIA_OUT: out })
        if (existsSync(out)) return await readFile(out)
      } catch { /* Word missing or failed: try LibreOffice */ }
    }
    const soffice = sofficePaths().find((p) => existsSync(p))
    if (soffice) {
      await run(soffice, ['--headless', '--norestore', '--convert-to', 'docx', '--outdir', dir, path])
      const produced = (await readdir(dir)).find((f) => f.toLowerCase().endsWith('.docx'))
      if (produced) return await readFile(join(dir, produced))
    }
    throw new CodebookDocumentError(t("This .doc file could not be opened. Open it in Word or LibreOffice, save it as .docx and import that file."))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function readCodebookDocument(path: string): Promise<OutlineParagraph[]> {
  let data: Buffer
  try {
    data = await readFile(path)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') {
      throw new CodebookDocumentError(t("Windows did not let labiia_quali open this file. This is usually an antivirus protecting documents in folders such as the Desktop or Documents (in Avast: Protection → Sensitive Data Shield or Ransomware Shield). Allow labiia_quali in the antivirus, or copy the file to another folder, and import again."))
    }
    throw err
  }
  const head = data.subarray(0, 8).toString('latin1')
  const ext = extname(path).slice(1).toLowerCase()
  if (head.startsWith('{\\rtf')) return readRtfParagraphs(data.toString('latin1'))
  if (head.startsWith('PK')) {
    const zipText = data.toString('latin1', 0, Math.min(data.length, 4096))
    return zipText.includes('opendocument') ? readOdtParagraphs(data) : readDocxParagraphs(data)
  }
  // The old Word format starts with the OLE compound-file signature.
  if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) return readDocxParagraphs(await convertDocToDocx(path))
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') return readMarkdownParagraphs(data.toString('utf-8').replace(/^﻿/, ''))
  throw new CodebookDocumentError(t("This file is not a Word, OpenDocument, RTF or Markdown document."))
}
