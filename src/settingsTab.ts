import type { App } from 'obsidian';
import { Notice, Platform, PluginSettingTab, Setting } from 'obsidian';

import { checkPreamble, CITE_STYLES } from './core/exportOptions';

import type { ColorOption, ToolbarHighlight } from './core/settings';
import { DEFAULT_COMMENT_COLOR, DEFAULT_PARAGRAPH_COLOR } from './core/settings';
import { isRiskySigil } from './core/sigil';
import type { EnterBehavior, LabelStyle, LevelFormat, ViewState } from './core/types';
import type VirtualOutlinerPlugin from './main';
import {
	isNoteToolbarAvailable,
	itemDisplayName,
	listHighlightableItems,
	listToolbars,
} from './ui/toolbarHighlight';

function isValidHex(v: string): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(v);
}

const ENTER_BEHAVIOR_OPTIONS: Record<EnterBehavior, string> = {
	section: 'After the whole section',
	line: 'On the next line',
};

const LABEL_STYLE_OPTIONS: Record<LabelStyle, string> = {
	'1': '1, 2, 3',
	'1.0': 'N.0 (1.0, 2.0, 3.0)',
	'1.1': 'Dotted path (1.2.1)',
	I: 'I, II, III',
	i: 'i, ii, iii',
	A: 'A, B, C',
	a: 'a, b, c',
	bullet: 'Bullet (•)',
	none: 'None',
};

const VIEW_STATE_OPTIONS: Record<ViewState, string> = {
	outline: 'Outline only',
	body: 'Body only',
	both: 'Both',
};

export class VirtualOutlinerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: VirtualOutlinerPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Depth sigil')
			.setDesc(
				'The character repeated at line start to mark an outline entry (e.g. "@@ text" is a level-2 entry). Exactly one character.',
			)
			.addText((text) => {
				text.setValue(this.plugin.settings.sigil).onChange(async (value) => {
					const char = value.trim();
					if (char.length !== 1 || /\s/.test(char)) return;
					this.plugin.settings.sigil = char;
					await this.plugin.saveSettings();
					this.display();
				});
				text.inputEl.maxLength = 1;
			});

		if (isRiskySigil(this.plugin.settings.sigil)) {
			containerEl.createEl('p', {
				cls: 'vo-fixture-note',
				text: `"${this.plugin.settings.sigil}" already opens a markdown block construct (heading, list, quote, …) at line start and may collide with it.`,
			});
		}

		new Setting(containerEl)
			.setName('Default view state')
			.setDesc('The view a note opens in when it has no view state recorded yet.')
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(VIEW_STATE_OPTIONS)) dropdown.addOption(value, label);
				dropdown.setValue(this.plugin.settings.defaultViewState).onChange(async (value) => {
					this.plugin.settings.defaultViewState = value as ViewState;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Indent body under its outline level')
			.setDesc('Visual only — the file itself is never re-indented.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.indentBody).onChange(async (value) => {
					this.plugin.settings.indentBody = value;
					await this.plugin.saveSettings();
				});
			});

		const markerColor = (
			name: string,
			desc: string,
			get: () => string,
			set: (value: string) => void,
			fallback: string,
		): void => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addColorPicker((picker) => {
					picker.setValue(get());
					picker.onChange(async (value) => {
						set(value);
						await this.plugin.saveSettings();
					});
				})
				.addExtraButton((button) => {
					button
						.setIcon('rotate-ccw')
						.setTooltip('Back to the default')
						.onClick(async () => {
							set(fallback);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		};
		markerColor(
			'Paragraph break colour',
			'The ¶ shown beside an entry that starts a new paragraph in the PDF.',
			() => this.plugin.settings.paragraphColor,
			(v) => (this.plugin.settings.paragraphColor = v),
			DEFAULT_PARAGRAPH_COLOR,
		);
		markerColor(
			'Comment colour',
			'Comment lines (`@% …`), which are never printed.',
			() => this.plugin.settings.commentColor,
			(v) => (this.plugin.settings.commentColor = v),
			DEFAULT_COMMENT_COLOR,
		);

		new Setting(containerEl)
			.setName('Enter at the end of an entry')
			.setDesc(
				'Where the new same-level entry goes. After the whole section keeps the current entry\'s body and sub-entries with it; on the next line puts the new entry directly below, so that body and those sub-entries move under the new entry. Pressing return in the middle of an entry always splits it in place.',
			)
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(ENTER_BEHAVIOR_OPTIONS)) dropdown.addOption(value, label);
				dropdown.setValue(this.plugin.settings.enterBehavior).onChange(async (value) => {
					this.plugin.settings.enterBehavior = value === 'line' ? 'line' : 'section';
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName('Level format').setHeading();
		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			text: 'One format applied to every outline level (e.g. "1.2.1" from repeated Number style + Separator). Indent step and Space above still accumulate with depth, so deeper levels sit further right and further apart even though the format itself is shared.',
		});

		this.renderLevelSetting(containerEl);

		new Setting(containerEl).setName('Metadata fields').setHeading();
		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			text: 'Per-node fields (status, note, …) exposed to Dataview/Datacore and stored in the end-of-file %%md-outline block.',
		});
		this.renderMetaFields(containerEl);

		this.renderToolbarSection(containerEl);
		this.renderPdfExportSection(containerEl);
	}

	// ── PDF export ──

	private renderPdfExportSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('PDF export').setHeading();
		if (!Platform.isDesktopApp) {
			containerEl.createEl('p', { cls: 'vo-fixture-note', text: 'PDF export runs on desktop only.' });
			return;
		}
		const pdf = this.plugin.settings.pdfExport;
		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- headnum, TOC, notes, cite, pdf-output are literal frontmatter keys
			text: 'Export to PDF typesets only the body text, never the outline. These are the defaults; a note\'s frontmatter (headnum, TOC, notes, cite, pdf-output) overrides them.',
		});

		new Setting(containerEl)
			.setName('Author')
			.setDesc('Shown in the running header. Frontmatter: author.')
			.addText((text) =>
				text.setValue(pdf.author).onChange(async (value) => {
					pdf.author = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName('Number headings')
			.addToggle((t) =>
				t.setValue(pdf.headnum).onChange(async (v) => {
					pdf.headnum = v;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName('Table of contents')
			.addToggle((t) =>
				t.setValue(pdf.toc).onChange(async (v) => {
					pdf.toc = v;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl).setName('Notes').addDropdown((dd) =>
			dd
				.addOption('f', 'Footnotes at the bottom of the page')
				.addOption('e', 'Endnotes at the end of the document')
				.setValue(pdf.notes)
				.onChange(async (v) => {
					pdf.notes = v === 'e' ? 'e' : 'f';
					await this.plugin.saveSettings();
				}),
		);
		new Setting(containerEl)
			.setName('Citation style')
			.setDesc('Citation data comes from Zotero through the Zotero Manager plugin; Zotero must be running.')
			.addDropdown((dd) => {
				for (const style of CITE_STYLES) dd.addOption(style, style.replace('-', ' '));
				dd.setValue(CITE_STYLES.includes(pdf.cite) ? pdf.cite : 'MLA').onChange(async (v) => {
					pdf.cite = v;
					await this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName('Open PDF after export')
			.addToggle((t) =>
				t.setValue(pdf.openAfterExport).onChange(async (v) => {
					pdf.openAfterExport = v;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName('Keep build files')
			.setDesc('Keep the generated .tex, log and converted Markdown after a successful export. They are always kept after a failure.')
			.addToggle((t) =>
				t.setValue(pdf.keepBuildFiles).onChange(async (v) => {
					pdf.keepBuildFiles = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('LaTeX preamble')
			.setDesc('Included in every export, after pandoc\'s own setup. A Pre*.tex beside a note, or latex-preamble: in its frontmatter, takes precedence.')
			.addButton((b) =>
				b.setButtonText('Import from file…').onClick(() => {
					const input = activeDocument.createElement('input');
					input.type = 'file';
					input.accept = '.tex,text/plain';
					input.onchange = async () => {
						const file = input.files?.[0];
						if (!file) return;
						pdf.preamble = await file.text();
						await this.plugin.saveSettings();
						new Notice(`Preamble imported from ${file.name}`);
						this.display();
					};
					input.click();
				}),
			)
			.addButton((b) =>
				b.setButtonText('Reset to default').onClick(async () => {
					pdf.preamble = this.plugin.defaultPreamble();
					await this.plugin.saveSettings();
					this.display();
				}),
			);
		const area = containerEl.createEl('textarea', { cls: 'vo-preamble-editor' });
		area.value = pdf.preamble;
		area.spellcheck = false;
		area.rows = 25;
		const warnings = containerEl.createDiv({ cls: 'vo-preamble-warnings' });
		const showWarnings = (): void => {
			warnings.empty();
			for (const w of checkPreamble(area.value)) warnings.createDiv({ text: w });
		};
		showWarnings();
		let timer: number | null = null;
		area.addEventListener('input', () => {
			showWarnings();
			if (timer !== null) window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				timer = null;
				pdf.preamble = area.value;
				void this.plugin.saveSettings();
			}, 600);
		});

		const status = this.plugin.pdfToolStatus();
		new Setting(containerEl)
			.setName('Renderer')
			.setDesc(status)
			.addButton((b) =>
				b.setButtonText('Install quick action').onClick(async () => {
					await this.plugin.installQuickActionFromSettings();
				}),
			);
	}

	// ── Note Toolbar buttons (ported from md-annotation's Note Toolbar tab) ──

	private renderToolbarSection(containerEl: HTMLElement): void {
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Note Toolbar' is the plugin's own name
		new Setting(containerEl).setName('Note Toolbar buttons').setHeading();

		if (!isNoteToolbarAvailable(this.app)) {
			containerEl.createEl('p', {
				cls: 'vo-fixture-note',
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Note Toolbar' is the plugin's own name
				text: 'Install and enable the Note Toolbar plugin to have one of its buttons change colour while the toggle it runs is on.',
			});
			return;
		}

		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Note Toolbar' is the plugin's own name; On/Off name the grid columns
			text: 'Pick the toolbar button that runs each toggle command below and it takes the On colour while that toggle is on, so the toolbar reads as pressed, and the Off colour while it is off. A colour left unticked leaves the button to Note Toolbar for that state — Off is unticked by default, so only "on" stands out. Backgrounds only: the icon and label colour stay Note Toolbar\'s.',
		});

		const highlights = this.plugin.settings.toolbarHighlights;
		const rows: { name: string; short: string; highlight: ToolbarHighlight }[] = [
			{ name: 'Outline sidebar button', short: 'Sidebar', highlight: highlights.sidebar },
			{ name: 'Indent body button', short: 'Indent body', highlight: highlights.indentBody },
			{ name: 'Enter on next line button', short: 'Enter: next line', highlight: highlights.enterBehavior },
		];
		for (const row of rows) this.renderToolbarItemPicker(containerEl, row.name, row.highlight);

		const wrap = containerEl.createDiv('vo-grid-wrap');
		const table = wrap.createEl('table', { cls: 'vo-grid-table' });
		const thead = table.createEl('thead');
		const r1 = thead.createEl('tr');
		r1.createEl('th', { text: 'Button', attr: { rowspan: '2' }, cls: 'vo-grid-name-h' });
		r1.createEl('th', { text: 'Light', attr: { colspan: '2' }, cls: 'vo-grid-sep' });
		r1.createEl('th', { text: 'Dark', attr: { colspan: '2' }, cls: 'vo-grid-sep' });
		r1.createEl('th', { text: 'Example', attr: { rowspan: '2' }, cls: 'vo-grid-sep' });
		const r2 = thead.createEl('tr');
		for (let i = 0; i < 4; i++) {
			r2.createEl('th', { text: i % 2 === 0 ? 'On' : 'Off', cls: i % 2 === 0 ? 'vo-grid-sep' : '' });
		}
		const tbody = table.createEl('tbody');
		for (const row of rows) this.renderToolbarHighlightRow(tbody, row.short, row.highlight);
	}

	// Toolbar + item dropdowns. Changing the toolbar clears the item, since
	// item uuids belong to a single toolbar.
	private renderToolbarItemPicker(containerEl: HTMLElement, name: string, highlight: ToolbarHighlight): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc('Toolbar, then the button within it')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'None');
				for (const toolbar of listToolbars(this.app)) dropdown.addOption(toolbar.uuid, toolbar.name);
				dropdown.setValue(highlight.toolbarUuid).onChange(async (value) => {
					highlight.toolbarUuid = value;
					highlight.itemUuid = '';
					await this.plugin.saveSettings();
					this.display();
				});
			})
			.addDropdown((dropdown) => {
				const items = highlight.toolbarUuid ? listHighlightableItems(this.app, highlight.toolbarUuid) : [];
				dropdown.addOption('', items.length === 0 ? 'No buttons' : 'None');
				for (const item of items) dropdown.addOption(item.uuid, itemDisplayName(item));
				dropdown.setDisabled(items.length === 0);
				dropdown.setValue(highlight.itemUuid).onChange(async (value) => {
					highlight.itemUuid = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private renderToolbarHighlightRow(tbody: HTMLElement, label: string, highlight: ToolbarHighlight): void {
		const tr = tbody.createEl('tr');
		tr.createEl('td', { text: label, cls: 'vo-grid-name' });

		let exampleTd: HTMLElement | null = null;
		const refreshExample = (): void => {
			if (!exampleTd) return;
			exampleTd.empty();
			const theme = this.containerEl.ownerDocument.body.classList.contains('theme-dark') ? 'dark' : 'light';
			for (const [text, opt] of [
				['On', highlight.on[theme]],
				['Off', highlight.off[theme]],
			] as const) {
				const span = exampleTd.createEl('span', { text });
				span.setCssStyles({ backgroundColor: opt.enabled && isValidHex(opt.color) ? opt.color : '' });
				exampleTd.appendText(' ');
			}
		};

		for (const theme of ['light', 'dark'] as const) {
			for (const state of ['on', 'off'] as const) {
				const td = tr.createEl('td', { cls: state === 'on' ? 'vo-grid-sep' : '' });
				this.renderColorCell(td, highlight[state][theme], refreshExample);
			}
		}

		exampleTd = tr.createEl('td', { cls: 'vo-grid-example vo-grid-sep' });
		refreshExample();
	}

	// A checkbox, a swatch (native picker), and an editable hex field bound to
	// one ColorOption. Setting a colour by either control ticks the checkbox;
	// the checkbox alone decides whether the stored colour is applied.
	private renderColorCell(td: HTMLElement, opt: ColorOption, onChanged: () => void): void {
		const wrap = td.createDiv('vo-grid-cell');
		const check = wrap.createEl('input', { attr: { type: 'checkbox' }, cls: 'vo-grid-check' });
		check.checked = opt.enabled;
		const picker = wrap.createEl('input', { attr: { type: 'color' }, cls: 'vo-grid-color' });
		picker.value = isValidHex(opt.color) ? opt.color : '#888888';
		const hex = wrap.createEl('input', {
			cls: 'vo-grid-hex',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- '#hex' is a hex-notation placeholder, not prose
			attr: { type: 'text', maxlength: '7', placeholder: '#hex', spellcheck: 'false' },
		});
		hex.value = isValidHex(opt.color) ? opt.color : '';

		const setColor = (value: string, persist: boolean): void => {
			opt.color = value;
			picker.value = value;
			hex.value = value;
			if (!opt.enabled) {
				opt.enabled = true;
				check.checked = true;
			}
			if (persist) void this.plugin.saveSettings();
			onChanged();
		};

		check.addEventListener('change', () => {
			opt.enabled = check.checked;
			if (opt.enabled && !isValidHex(opt.color)) {
				opt.color = picker.value;
				hex.value = picker.value;
			}
			void this.plugin.saveSettings();
			onChanged();
		});
		// 'input' fires continuously while dragging in the colour dialog — update
		// the example live, persist only on 'change'.
		picker.addEventListener('input', () => setColor(picker.value, false));
		picker.addEventListener('change', () => setColor(picker.value, true));
		hex.addEventListener('change', () => {
			const raw = hex.value.trim();
			const value = raw.startsWith('#') ? raw : `#${raw}`;
			if (isValidHex(value)) setColor(value.toLowerCase(), true);
			else hex.value = isValidHex(opt.color) ? opt.color : '';
		});
	}

	// One NAMED row per property, applied to every level at once (Update003:
	// the previous layout repeated these ten controls inside a collapsible
	// block per level, which was mostly redundant — nothing here needs to
	// differ level to level, and levelCssVars already accumulates Indent
	// step/Space above across levels regardless of whether the six stored
	// LevelFormat entries are distinct or identical).
	//
	// The array's six LevelFormat entries stay in settings as separate
	// objects (render.ts/label.ts/levelCssVars all still index into
	// `levels[n]`), so this editor writes every change to ALL SIX slots
	// rather than changing the stored shape. Displayed values are seeded from
	// level 1's entry; an old vault whose levels still differ from a
	// pre-Update003 install keeps that difference invisibly until the first
	// edit here flattens it.
	private renderLevelSetting(containerEl: HTMLElement): void {
		const format = this.plugin.settings.levels[0];
		if (!format) return;

		const applyToAllLevels = async (mutate: (level: LevelFormat) => void): Promise<void> => {
			for (const level of this.plugin.settings.levels) mutate(level);
			await this.plugin.saveSettings();
		};

		new Setting(containerEl)
			.setName('Number style')
			.setDesc('How each level\'s segment of the composite label is numbered (e.g. "1" + "." gives "1.2.1").')
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(LABEL_STYLE_OPTIONS)) dropdown.addOption(value, label);
				dropdown.setValue(format.style).onChange(async (value) => {
					await applyToAllLevels((level) => {
						level.style = value as LabelStyle;
					});
				});
			});

		this.addTextRow(
			containerEl,
			'Separator',
			'Placed before a level\'s segment when a shallower level already contributed one (e.g. "." gives 2.1).',
			format.separator,
			async (value) => {
				await applyToAllLevels((level) => {
					level.separator = value;
				});
			},
		);

		new Setting(containerEl)
			.setName('Italic')
			.setDesc('Renders every level\'s number and entry text in italics.')
			.addToggle((toggle) => {
				toggle.setValue(format.italic);
				toggle.onChange(async (value) => {
					await applyToAllLevels((level) => {
						level.italic = value;
					});
				});
			});

		new Setting(containerEl)
			.setName('Colour')
			.setDesc('Colour of every level\'s number and entry text.')
			.addColorPicker((picker) => {
				if (format.color !== '') picker.setValue(format.color);
				picker.onChange(async (value) => {
					await applyToAllLevels((level) => {
						level.color = value;
					});
				});
			})
			.addExtraButton((button) => {
				button
					.setIcon('rotate-ccw')
					.setTooltip('Use the theme colour')
					.onClick(async () => {
						await applyToAllLevels((level) => {
							level.color = '';
						});
						this.display();
					});
			});

		this.addTextRow(
			containerEl,
			'Font size',
			'Any CSS length (e.g. 1.2em). Blank inherits the note\'s font size.',
			format.fontSize,
			async (value) => {
				await applyToAllLevels((level) => {
					level.fontSize = value;
				});
			},
		);
		this.addTextRow(
			containerEl,
			'Font weight',
			'A CSS weight (e.g. 600, bold). Blank inherits.',
			format.fontWeight,
			async (value) => {
				await applyToAllLevels((level) => {
					level.fontWeight = value;
				});
			},
		);
		this.addTextRow(
			containerEl,
			'Font family',
			'A CSS font family. Blank inherits.',
			format.fontFamily,
			async (value) => {
				await applyToAllLevels((level) => {
					level.fontFamily = value;
				});
			},
		);
		// Level 1 keeps a fixed 0 offset (the outline's own flush-left base
		// case), so this control edits index 1 onward — the shared step every
		// deeper level adds relative to the level above it — rather than
		// index 0's always-0px entry.
		this.addTextRow(
			containerEl,
			'Indent step',
			'A CSS length: how much further right each level sits than the level above it (level 1 stays flush left).',
			this.plugin.settings.levels[1]?.indentStep ?? format.indentStep,
			async (value) => {
				const levels = this.plugin.settings.levels;
				for (let i = 1; i < levels.length; i++) {
					const level = levels[i];
					if (level) level.indentStep = value;
				}
				await this.plugin.saveSettings();
			},
		);
		this.addTextRow(
			containerEl,
			'Space above',
			'A CSS length added above each entry, accumulating with depth.',
			format.spacing,
			async (value) => {
				await applyToAllLevels((level) => {
					level.spacing = value;
				});
			},
		);
		this.addTextRow(
			containerEl,
			'Label gap',
			'A CSS length between the number and the entry text.',
			format.labelGap,
			async (value) => {
				await applyToAllLevels((level) => {
					level.labelGap = value;
				});
			},
		);
	}

	private addTextRow(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		value: string,
		apply: (value: string) => Promise<void>,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				text.setValue(value);
				text.onChange(async (next) => {
					await apply(next);
				});
			});
	}

	private renderMetaFields(containerEl: HTMLElement): void {
		const fields = this.plugin.settings.metaFields;
		for (let i = 0; i < fields.length; i++) {
			const field = fields[i];
			if (!field) continue;
			const setting = new Setting(containerEl).setName(`Field ${i + 1}`);
			setting.addText((text) => {
				text.setPlaceholder('Name').setValue(field.name);
				text.onChange(async (value) => {
					field.name = value;
					await this.plugin.saveSettings();
				});
			});
			setting.addDropdown((dropdown) => {
				dropdown.addOption('text', 'Text');
				dropdown.addOption('select', 'Select');
				dropdown.setValue(field.type).onChange(async (value) => {
					field.type = value === 'select' ? 'select' : 'text';
					await this.plugin.saveSettings();
					this.display();
				});
			});
			if (field.type === 'select') {
				setting.addText((text) => {
					text.setPlaceholder('Options, comma-separated').setValue(field.options.join(', '));
					text.onChange(async (value) => {
						field.options = value
							.split(',')
							.map((o) => o.trim())
							.filter((o) => o !== '');
						await this.plugin.saveSettings();
					});
				});
			}
			setting.addExtraButton((button) => {
				button
					.setIcon('trash')
					.setTooltip('Remove field')
					.onClick(async () => {
						fields.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					});
			});
		}

		new Setting(containerEl).addButton((button) => {
			button.setButtonText('Add field').onClick(async () => {
				fields.push({ name: `Field ${fields.length + 1}`, type: 'text', options: [] });
				await this.plugin.saveSettings();
				this.display();
			});
		});
	}
}
