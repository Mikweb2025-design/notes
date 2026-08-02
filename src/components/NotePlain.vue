<!--
  - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<NcAppContent :class="{ loading: loading || isManualSave, 'icon-error': !loading && (!note || note.error)}">
		<div v-if="!loading && note && !note.error && !note.deleting"
			id="note-container"
			class="note-container"
			:class="{ fullscreen: fullscreen }"
		>
			<NcModal v-if="note.conflict && showConflict" size="full" @close="showConflict = false">
				<div class="conflict-modal">
					<div class="conflict-header">
						<SyncAlertIcon :size="30" fillColor="var(--color-error)" />
						{{ t('notes', 'The note has been changed in another session. Please choose which version should be saved.') }}
					</div>
					<div class="conflict-solutions">
						<ConflictSolution
							:content="note.conflict.content"
							:reference="note.reference.content"
							:button="t('notes', 'Use version from server')"
							@chooseSolution="onUseRemoteVersion"
						/>
						<ConflictSolution
							:content="note.content"
							:reference="note.reference.content"
							:button="t('notes', 'Use current version')"
							@chooseSolution="onUseLocalVersion"
						/>
					</div>
				</div>
			</NcModal>
			<div class="note-editor">
				<div v-if="noteColor" class="note-color-bar" :style="{ backgroundColor: noteColor }" />
				<div v-if="dueDate" class="note-due-bar" :title="t('notes', 'Due date')">
					<span class="note-due-dot" :style="{ backgroundColor: noteColor || 'var(--color-primary-element)' }" />
					{{ t('notes', 'Due') }}: {{ formatDueDate(dueDate) }}
				</div>
				<div v-if="note" class="note-color-toolbar">
					<span class="note-color-toolbar-label">{{ t('notes', 'Color') }}</span>
					<button
						v-for="swatch in palette"
						:key="swatch"
						class="note-color-swatch"
						:class="{ active: swatch === noteColor }"
						:style="{ backgroundColor: swatch }"
						:title="swatch"
						:disabled="note.readonly"
						@click="onPickColor(swatch)"
					>
						<span v-if="swatch === noteColor" class="note-color-check">✓</span>
					</button>
					<button
						class="note-color-clear"
						:title="t('notes', 'Remove color')"
						:disabled="note.readonly || !noteColor"
						@click="onRemoveColor"
					>
						<CloseIcon :size="16" />
					</button>
				</div>
				<div v-show="!note.content" class="placeholder">
					{{ preview ? t('notes', 'Empty note') : t('notes', 'Write …') }}
				</div>
				<ThePreview v-if="preview"
					:value="note.content"
					:noteid="noteId"
					:readonly="note.readonly"
					@input="onEdit"
				/>
				<TheEditor v-else
					:value="note.content"
					:noteid="noteId"
					:notecategory="note.category"
					:readonly="note.readonly"
					@input="onEdit"
				/>
			</div>
			<span class="action-buttons">
				<NcActions v-model:open="actionsOpen" container=".action-buttons" menuAlign="right">
					<NcActionButton
						:title="t('notes', 'CTRL + /')"
						@click="onTogglePreview"
					>
						<template v-if="preview" #icon>
							<PencilOutlineIcon :size="20" />
						</template>
						<template v-else #icon>
							<EyeOutlineIcon :size="20" />
						</template>
						{{ preview ? t('notes', 'Edit') : t('notes', 'Preview') }}
					</NcActionButton>
					<NcActionButton
						:class="{ active: fullscreen }"
						@click="onToggleDistractionFree"
					>
						<template #icon>
							<FullscreenIcon :size="20" />
						</template>
						{{ fullscreen ? t('notes', 'Exit full screen') : t('notes', 'Full screen') }}
					</NcActionButton>
				</NcActions>
				<NcActions v-if="note.readonly">
					<NcActionButton>
						<template #icon>
							<PencilOffOutlineIcon :size="20" />
						</template>
						{{ t('notes', 'Note is read-only. You cannot change it.') }}
					</NcActionButton>
				</NcActions>
				<NcActions v-if="note.saveError" class="action-error">
					<NcActionButton @click="onManualSave">
						<template #icon>
							<SyncAlertIcon :size="20" fillColor="var(--color-text)" />
						</template>
						{{ t('notes', 'Save failed. Click to retry.') }}
					</NcActionButton>
				</NcActions>
				<NcActions v-if="note.conflict" class="action-error">
					<NcActionButton @click="showConflict = true">
						<template #icon>
							<SyncAlertIcon :size="20" fillColor="var(--color-text)" />
						</template>
						{{ t('notes', 'Update conflict. Click for resolving manually.') }}
					</NcActionButton>
				</NcActions>
			</span>
		</div>
	</NcAppContent>
</template>

<script>

import { showError } from '@nextcloud/dialogs'
import { emit, subscribe, unsubscribe } from '@nextcloud/event-bus'
import { useIsMobile } from '@nextcloud/vue/composables/useIsMobile'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcModal from '@nextcloud/vue/components/NcModal'
import CloseIcon from 'vue-material-design-icons/Close.vue'
import EyeOutlineIcon from 'vue-material-design-icons/EyeOutline.vue'
import FullscreenIcon from 'vue-material-design-icons/Fullscreen.vue'
import PencilOffOutlineIcon from 'vue-material-design-icons/PencilOffOutline.vue'
import PencilOutlineIcon from 'vue-material-design-icons/PencilOutline.vue'
import SyncAlertIcon from 'vue-material-design-icons/SyncAlert.vue'
import ConflictSolution from './ConflictSolution.vue'
import TheEditor from './EditorEasyMDE.vue'
import ThePreview from './EditorMarkdownIt.vue'
import { config } from '../config.js'
import logger from '../Logger.js'
import { conflictSolutionLocal, conflictSolutionRemote, fetchNote, queueCommand, refreshNote, saveNoteManually, setColor } from '../NotesService.js'
import store from '../store.js'
import { dueDateFromNote, formatDueDate, noteColorFromNote, noteColorPalette, routeIsNewNote } from '../Util.js'

export default {
	name: 'NotePlain',

	components: {
		CloseIcon,
		ConflictSolution,
		PencilOutlineIcon,
		EyeOutlineIcon,
		FullscreenIcon,
		NcActions,
		NcActionButton,
		NcAppContent,
		NcModal,
		PencilOffOutlineIcon,
		SyncAlertIcon,
		TheEditor,
		ThePreview,
	},

	props: {
		noteId: {
			type: String,
			required: true,
		},
	},

	setup() {
		return {
			isMobile: useIsMobile(),
		}
	},

	data() {
		return {
			loading: false,
			fullscreen: false,
			preview: false,
			actionsOpen: false,
			autosaveTimer: null,
			autotitleTimer: null,
			refreshTimer: null,
			etag: null,
			showConflict: false,
		}
	},

	computed: {
		note() {
			return store.notes.getNote(parseInt(this.noteId))
		},

		title() {
			return this.note ? this.note.title : ''
		},

		isNewNote() {
			return routeIsNewNote(this.$route)
		},

		noteColor() {
			return this.note ? noteColorFromNote(this.note) : null
		},

		dueDate() {
			return this.note ? dueDateFromNote(this.note.content) : null
		},

		palette() {
			return noteColorPalette
		},

		isManualSave() {
			return store.app.isManualSave
		},
	},

	watch: {
		$route(to, from) {
			if (to.name !== from.name || to.params.noteId !== from.params.noteId) {
				this.fetchData()
			}
		},

		title: 'onUpdateTitle',
		'note.conflict': function(newConflict) {
			if (newConflict) {
				this.showConflict = true
			}
		},
	},

	created() {
		this.fetchData()
		document.addEventListener('webkitfullscreenchange', this.onDetectFullscreen)
		document.addEventListener('mozfullscreenchange', this.onDetectFullscreen)
		document.addEventListener('fullscreenchange', this.onDetectFullscreen)
		document.addEventListener('keydown', this.onKeyPress)
		document.addEventListener('visibilitychange', this.onVisibilityChange)
		subscribe('files_versions:restore:requested', this.onFileRestoreRequested)
		subscribe('files_versions:restore:restored', this.onFileRestored)
	},

	unmounted() {
		this.stopRefreshTimer()
		document.removeEventListener('webkitfullscreenchange', this.onDetectFullscreen)
		document.removeEventListener('mozfullscreenchange', this.onDetectFullscreen)
		document.removeEventListener('fullscreenchange', this.onDetectFullscreen)
		document.removeEventListener('keydown', this.onKeyPress)
		document.removeEventListener('visibilitychange', this.onVisibilityChange)
		this.onUpdateTitle(null)
		unsubscribe('files_versions:restore:requested', this.onFileRestoreRequested)
		unsubscribe('files_versions:restore:restored', this.onFileRestored)
	},

	methods: {
		fetchData() {
			this.etag = null
			this.stopRefreshTimer()

			if (this.isMobile) {
				emit('toggle-navigation', { open: false })
			}

			this.onUpdateTitle(this.title)
			this.loading = true
			this.preview = store.app.settings.noteMode === 'preview' && !this.isNewNote
			fetchNote(parseInt(this.noteId))
				.then((note) => {
					if (note.error) {
						showError(t('notes', 'Error from Nextcloud server: {msg}', { msg: note.errorType }))
					}
					this.startRefreshTimer()
				})
				.catch(() => {
					// note not found
				})
				.then(() => {
					this.loading = false
				})
		},

		onUpdateTitle(title) {
			const defaultTitle = store.app.documentTitle
			if (title) {
				document.title = title + ' - ' + defaultTitle
			} else {
				document.title = defaultTitle
			}
		},

		onTogglePreview() {
			this.preview = !this.preview
			this.actionsOpen = false
		},

		formatDueDate,

		onPickColor(color) {
			if (!this.note || this.note.readonly || this.noteColor === color) {
				return
			}
			setColor(this.note.id, color).catch(() => {})
		},

		onRemoveColor() {
			if (!this.note || this.note.readonly || !this.noteColor) {
				return
			}
			setColor(this.note.id, '').catch(() => {})
		},

		onDetectFullscreen() {
			this.fullscreen = document.fullScreen || document.mozFullScreen || document.webkitIsFullScreen
		},

		onToggleDistractionFree() {
			function launchIntoFullscreen(element) {
				if (element.requestFullscreen) {
					element.requestFullscreen()
				} else if (element.mozRequestFullScreen) {
					element.mozRequestFullScreen()
				} else if (element.webkitRequestFullscreen) {
					element.webkitRequestFullscreen()
				} else if (element.msRequestFullscreen) {
					element.msRequestFullscreen()
				}
			}

			function exitFullscreen() {
				if (document.exitFullscreen) {
					document.exitFullscreen()
				} else if (document.mozCancelFullScreen) {
					document.mozCancelFullScreen()
				} else if (document.webkitExitFullscreen) {
					document.webkitExitFullscreen()
				}
			}

			if (this.fullscreen) {
				exitFullscreen()
			} else {
				launchIntoFullscreen(document.getElementById('note-container'))
			}
			this.actionsOpen = false
		},

		onVisibilityChange() {
			if (document.visibilityState === 'visible') {
				this.stopRefreshTimer()
				this.refreshNote()
			}
		},

		stopRefreshTimer() {
			if (this.refreshTimer !== null) {
				clearTimeout(this.refreshTimer)
				this.refreshTimer = null
			}
		},

		startRefreshTimer() {
			this.stopRefreshTimer()
			const interval = document.visibilityState === 'visible' ? config.interval.note.refresh : config.interval.note.refreshHidden
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = null
				this.refreshNote()
			}, interval * 1000)
		},

		refreshNote() {
			if (!this.note) {
				this.startRefreshTimer()
				return
			}
			if (this.note.unsaved && !this.note.conflict) {
				this.startRefreshTimer()
				return
			}
			refreshNote(parseInt(this.noteId), this.etag).then((etag) => {
				if (etag) {
					this.etag = etag
					this.$forceUpdate()
				}
				this.startRefreshTimer()
			})
		},

		onEdit(newContent) {
			if (this.note.content !== newContent) {
				this.stopRefreshTimer()
				const note = {
					...this.note,
					content: newContent,
					unsaved: true,
				}
				store.notes.updateNote(note)
				this.$forceUpdate()

				// queue auto saving note content
				if (this.autosaveTimer === null) {
					this.autosaveTimer = setTimeout(() => {
						this.autosaveTimer = null
						queueCommand(note.id, 'content')
					}, config.interval.note.autosave * 1000)
				}

				// (re-) start auto refresh timer
				// TODO should be after save is finished
				this.startRefreshTimer()

				// stop old autotitle timer
				if (this.autotitleTimer !== null) {
					clearTimeout(this.autotitleTimer)
					this.autotitleTimer = null
				}
				// start autotitle timer if note is new
				if (this.isNewNote) {
					this.autotitleTimer = setTimeout(() => {
						this.autotitleTimer = null
						if (this.isNewNote) {
							queueCommand(note.id, 'autotitle')
						}
					}, config.interval.note.autotitle * 1000)
				}
			}
		},

		onKeyPress(event) {
			if (event.ctrlKey || event.metaKey) {
				switch (event.key.toLowerCase()) {
					case 's':
						event.preventDefault()
						this.onManualSave()
						break
					case '/':
						event.preventDefault()
						this.onTogglePreview()
						break
				}
			}
		},

		onManualSave() {
			const note = {
				...this.note,
			}
			store.notes.updateNote(note)
			saveNoteManually(this.note.id)
		},

		onUseLocalVersion() {
			logger.debug('conflict solution: use local version')
			conflictSolutionLocal(this.note)
			this.showConflict = false
		},

		onUseRemoteVersion() {
			logger.debug('conflict solution: use remote version')
			conflictSolutionRemote(this.note)
			this.showConflict = false
		},

		async onFileRestoreRequested(event) {
			const { fileInfo } = event

			if (!this.note || fileInfo.id !== this.note.id) {
				return
			}

			this.loading = true
		},

		async onFileRestored(version) {
			if (!this.note || version.fileId !== this.note.id) {
				return
			}

			this.refreshNote()
			this.loading = false
		},
	},
}
</script>

<style scoped>
.note-container {
	min-height: 100%;
	width: 100%;
	background-color: var(--color-main-background);
	position: relative;
}

/* NoTeSynC: color accent derived from the note's "colorsync-#RRGGBB" category */
.note-color-bar {
	position: absolute;
	top: 0;
	inset-inline: 0;
	height: 4px;
}

.note-due-bar {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	margin-bottom: 0.6em;
	padding: 3px 10px;
	border-radius: 12px;
	color: var(--color-primary-text);
	background-color: var(--color-primary-element-light);
}

.note-due-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
}

.note-color-toolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	margin-bottom: 0.8em;
}

.note-color-toolbar-label {
	font-size: 13px;
	font-weight: bold;
	margin-inline-end: 2px;
	opacity: 0.7;
}

.note-color-swatch {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: 50%;
	cursor: pointer;
	transition: transform 0.1s ease;

	&:hover,
	&:active {
		transform: scale(1.15);
	}

	&.active {
		box-shadow: 0 0 0 2px var(--color-primary-element);
	}

	&:disabled {
		cursor: default;
		opacity: 0.5;
	}
}

.note-color-check {
	font-size: 14px;
	font-weight: bold;
	color: #333;
}

.note-color-clear {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	margin-inline-start: 4px;
	padding: 0;
	color: var(--color-error);
	background-color: transparent;
	border: 1px solid var(--color-border);
	border-radius: 50%;
	cursor: pointer;

	&:disabled {
		cursor: default;
		opacity: 0.4;
	}
}

.note-editor {
	max-width: 47em;
	font-size: 16px;
	padding: 1em;
	padding-bottom: 0;
}

/* center editor on large screens */
@media (min-width: 1600px) {
	.note-editor {
		margin: 0 auto;
	}
	.note-container {
		padding-inline-end: 250px;
		transition-duration: var(--animation-quick);
		transition-property: padding-inline-end;
	}
}

/* distraction free styles */
.note-container.fullscreen {
	width: 100vw;
	height: 100vh;
	overflow-y: auto;
	padding: 0;
}

.note-container.fullscreen .note-editor {
	margin: 0 auto;
}

/* placeholder */
.placeholder {
	position: absolute;
	padding: 1em;
	opacity: 0.5;
}

/* main editor button */
.action-buttons {
	position: fixed;
	top: 50px;
	inset-inline-end: 20px;
	width: var(--default-clickable-area);
	margin-top: 1em;
	z-index: 2000;
}

.action-buttons .action-error {
	background-color: var(--color-error);
	margin-top: 1ex;
}

.note-container.fullscreen .action-buttons {
	top: 0px;
}

/* Conflict Modal */
.conflict-modal {
	width: 70vw;
	margin: auto;
}

.conflict-header {
	padding: 1ex 1em;
}

.conflict-solutions {
	display: flex;
	flex-direction: row-reverse;
	max-height: 75vh;
	overflow-y: auto;
}

@media (max-width: 60em) {
	.conflict-solutions {
		flex-direction: column;
	}
}

</style>
