/**
 * SPDX-FileCopyrightText: 2021 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const noteAttributes = [
	'id',
	'etag',
	'title',
	'content',
	'modified',
	'favorite',
	'category',
]

export function copyNote(from, to, exclude) {
	if (exclude === undefined) {
		exclude = []
	}
	noteAttributes.forEach((attr) => {
		if (!exclude.includes(attr)) {
			to[attr] = from[attr]
		}
	})
	return to
}

export function categoryLabel(category) {
	return category === '' ? t('notes', 'Uncategorized') : category.replace(/\//g, ' / ')
}

// The NoTeSynC / ColorNoteSync Android app stores a note's color as its category
// in the Nextcloud Notes API (e.g. "colorsync-#FF0000"). There is no native
// color field, so the web app derives the color from the category to render a
// colored dot / tinted editor, while staying fully backwards compatible.

export const colorCategoryPrefix = 'colorsync-'

/**
 * Parses a "colorsync-#RRGGBB" category into a lower-case hex color like
 * "#ff0000", or null if the category is not a color-encoded one.
 *
 * @param {string} category the note's category string
 */
export function noteColorFromCategory(category) {
	if (typeof category !== 'string' || !category.startsWith(colorCategoryPrefix)) {
		return null
	}
	const hex = category.slice(colorCategoryPrefix.length)
	return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null
}

/**
 * Parses the leading "[due:YYYY-MM-DD]" marker line the Android app embeds in
 * the note content (there is no due-date field in the Notes API). Returns the
 * date string "YYYY-MM-DD" or null if absent.
 *
 * @param {string} content the note's markdown content
 */
export function dueDateFromNote(content) {
	if (typeof content !== 'string') {
		return null
	}
	const match = /^\[due:(\d{4}-\d{2}-\d{2})\]\n?/.exec(content)
	return match ? match[1] : null
}

// Localized long date form: "2026-08-05" -> "5 Aug 2026" per the user's locale
export function formatDueDate(date) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
	if (!match) {
		return date
	}
	const [y, m, d] = match.slice(1).map(Number)
	const parsed = new Date(y, m - 1, d)
	if (Number.isNaN(parsed.getTime())
		|| parsed.getFullYear() !== y
		|| parsed.getMonth() !== m - 1
		|| parsed.getDate() !== d) {
		return date
	}
	return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function routeIsNewNote($route) {
	return Object.hasOwn($route.query, 'new')
}

export function isNoteDrag(event) {
	const dt = event?.dataTransfer
	if (!dt) {
		return false
	}

	const types = Array.from(dt.types ?? [])
	if (types.includes('application/x-nextcloud-notes-note-id')) {
		return true
	}
	if (types.includes('text/uri-list')) {
		return false
	}
	try {
		return /^\s*\d+\s*$/.test(dt.getData('text/plain'))
	} catch {
		return false
	}
}

export function getDraggedNoteId(event, getNoteById) {
	const dt = event?.dataTransfer
	if (!dt) {
		return null
	}

	const types = Array.from(dt.types ?? [])
	const hasCustom = types.includes('application/x-nextcloud-notes-note-id')
	const hasUri = types.includes('text/uri-list')
	if (!hasCustom && hasUri) {
		return null
	}

	let raw = ''
	if (hasCustom) {
		try {
			raw = dt.getData('application/x-nextcloud-notes-note-id')
		} catch {
			// Some browsers only allow specific mime types.
		}
	}
	if (!raw) {
		try {
			raw = dt.getData('text/plain')
		} catch {
			raw = ''
		}
	}

	const match = /^\s*(\d+)\s*$/.exec(raw)
	const noteId = match ? Number.parseInt(match[1], 10) : Number.NaN
	if (!Number.isFinite(noteId)) {
		return null
	}
	const note = getNoteById ? getNoteById(noteId) : null
	if (!note || note.readonly) {
		return null
	}

	return noteId
}

export function getDefaultSampleNoteTitle() {
	return t('notes', 'Sample note')
}

/* eslint-disable @stylistic/indent-binary-ops */
export function getDefaultSampleNote() {
	return '# ' + getDefaultSampleNoteTitle() + `

* 📅 ` + t('notes', '15 January 2021, via Nextcloud Notes') + `
* 👥 ` + t('notes', 'Me, you, and all our friends!') + `

## ` + t('notes', 'Tasks') + ` ✅

* [ ] ` + t('notes', 'Write nice todo lists') + `
* [ ] ` + t('notes', 'Buy Fries') + `
* [ ] …

## ` + t('notes', 'Birthdays') + `

* ` + t('notes', 'Jen, in three days!') + `
* ` + t('notes', 'Moss, 21.03.1973') + `
* ` + t('notes', 'Roy, 1979') + `

## ` + t('notes', 'Review Steps') + ` 🔁

1. ` + t('notes', 'Turn PC off') + `
2. ` + t('notes', 'Turn PC on') + `
3. ` + t('notes', 'Then call IT') + `

## ` + t('notes', 'Quotes') + ` 💬

> ` + t('notes', 'Nextcloud, a safe home for all your data') + `
`
}
/* eslint-enable @stylistic/indent-binary-ops */

export function escapeHtml(str) {
	const element = document.createElement('div')
	element.textContent = str
	return element.innerHTML
}
