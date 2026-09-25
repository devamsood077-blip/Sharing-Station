import type { MediaKind, PhotoFile } from '../types/electron'

export function photoKind(photo: Pick<PhotoFile, 'name' | 'path'> & { kind?: MediaKind }): MediaKind {
  if (photo.kind) return photo.kind
  const name = (photo.path || photo.name).toLowerCase()
  if (name.endsWith('.mp4')) return 'video'
  if (name.endsWith('.gif')) return 'gif'
  return 'photo'
}

export function isPrintable(photo: Pick<PhotoFile, 'name' | 'path'> & { kind?: MediaKind }) {
  return photoKind(photo) === 'photo'
}

export function isVideo(photo: Pick<PhotoFile, 'name' | 'path'> & { kind?: MediaKind }) {
  return photoKind(photo) === 'video'
}
