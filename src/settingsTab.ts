import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';

import { isRiskySigil, MAX_LEVEL } from './core/sigil';
import type { LabelStyle, ViewState } from './core/types';
import type VirtualOutlinerPlugin from './main';

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

		new Setting(containerEl).setName('Level format').setHeading();
		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			text: 'Composite labels join one segment per level (e.g. "I.B.3") — each level below controls its own segment\'s style, separator, and typography. Click a level to open it.',
		});

		for (let level = 1; level <= MAX_LEVEL; level++) {
			this.renderLevelSetting(containerEl, level);
		}

		new Setting(containerEl).setName('Metadata fields').setHeading();
		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			text: 'Per-node fields (status, note, …) exposed to Dataview/Datacore and stored in the end-of-file %%md-outline block.',
		});
		this.renderMetaFields(containerEl);
	}

	// One collapsible block per level, one NAMED row per property. The
	// previous layout packed all nine controls into a single unlabelled row,
	// where an unlabelled toggle sat between a colour swatch and a text box
	// with nothing to say it meant "italic" — easy to flip by accident and
	// impossible to identify afterwards.
	private renderLevelSetting(containerEl: HTMLElement, level: number): void {
		const format = this.plugin.settings.levels[level - 1];
		if (!format) return;

		const details = containerEl.createEl('details', { cls: 'vo-level-details' });
		details.createEl('summary', { cls: 'vo-level-summary', text: `Level ${level}` });

		new Setting(details)
			.setName('Number style')
			.setDesc('How this level\'s own segment of the composite label is numbered.')
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(LABEL_STYLE_OPTIONS)) dropdown.addOption(value, label);
				dropdown.setValue(format.style).onChange(async (value) => {
					format.style = value as LabelStyle;
					await this.plugin.saveSettings();
				});
			});

		this.addTextRow(
			details,
			'Separator',
			'Placed before this level\'s segment when a level above it already contributed one (e.g. "." gives 2.1).',
			format.separator,
			async (value) => {
				format.separator = value;
			},
		);

		new Setting(details)
			.setName('Italic')
			.setDesc('Renders this level\'s number and entry text in italics.')
			.addToggle((toggle) => {
				toggle.setValue(format.italic);
				toggle.onChange(async (value) => {
					format.italic = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(details)
			.setName('Colour')
			.setDesc('Colour of this level\'s number and entry text.')
			.addColorPicker((picker) => {
				if (format.color !== '') picker.setValue(format.color);
				picker.onChange(async (value) => {
					format.color = value;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((button) => {
				button
					.setIcon('rotate-ccw')
					.setTooltip('Use the theme colour')
					.onClick(async () => {
						format.color = '';
						await this.plugin.saveSettings();
						this.display();
					});
			});

		this.addTextRow(
			details,
			'Font size',
			'Any CSS length (e.g. 1.2em). Blank inherits the note\'s font size.',
			format.fontSize,
			async (value) => {
				format.fontSize = value;
			},
		);
		this.addTextRow(
			details,
			'Font weight',
			'A CSS weight (e.g. 600, bold). Blank inherits.',
			format.fontWeight,
			async (value) => {
				format.fontWeight = value;
			},
		);
		this.addTextRow(details, 'Font family', 'A CSS font family. Blank inherits.', format.fontFamily, async (value) => {
			format.fontFamily = value;
		});
		this.addTextRow(
			details,
			'Indent step',
			level === 1
				? 'A CSS length. Level 1 sets the whole outline\'s base offset from the left margin — 0 keeps it flush.'
				: 'A CSS length: how much further right this level sits than the level above it.',
			format.indentStep,
			async (value) => {
				format.indentStep = value;
			},
		);
		this.addTextRow(
			details,
			'Space above',
			'A CSS length added above each entry at this level.',
			format.spacing,
			async (value) => {
				format.spacing = value;
			},
		);
		this.addTextRow(
			details,
			'Label gap',
			'A CSS length between the number and the entry text.',
			format.labelGap,
			async (value) => {
				format.labelGap = value;
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
					await this.plugin.saveSettings();
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
