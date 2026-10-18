// Local-disk uploads (port of app/core/storage.py).
// Files are written under UPLOAD_DIR/<folder>/ and served at /uploads/<folder>/<name>.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { config } from './config.js'
import { ApiError } from './errors.js'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const ALLOWED_SUFFIXES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf'])

// First start on a new server: bring the files the starter database refers to.
if (!fs.existsSync(config.uploadDir) && fs.existsSync(config.starterUploads)) {
  fs.cpSync(config.starterUploads, config.uploadDir, { recursive: true })
  console.log(`[uploads] copied starter files to ${config.uploadDir}`)
}
fs.mkdirSync(config.uploadDir, { recursive: true })

/** multer middleware for one file field named "file" (kept in memory, max size enforced). */
export const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes + 1, files: 1 },
}).single('file')

/** Validate + store an uploaded file; returns its public URL path. */
export function saveUpload(file, folder = 'misc') {
  if (!file) throw ApiError.badRequest('Validation failed', [{ field: 'file', message: 'Field required' }])
  if (!ALLOWED_TYPES.has(file.mimetype)) throw ApiError.badRequest('Only JPG, PNG, WEBP and PDF files are allowed')
  const suffix = path.extname(file.originalname || '').toLowerCase()
  if (!ALLOWED_SUFFIXES.has(suffix)) throw ApiError.badRequest('Unsupported file extension')
  if (file.size > config.maxUploadBytes) throw ApiError.badRequest('File is too large')
  if (!file.size) throw ApiError.badRequest('The uploaded file is empty')

  const dir = path.join(config.uploadDir, folder)
  fs.mkdirSync(dir, { recursive: true })
  const name = `${crypto.randomBytes(12).toString('hex')}${suffix}`
  fs.writeFileSync(path.join(dir, name), file.buffer)
  return `/uploads/${folder}/${name}`
}
