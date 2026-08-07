import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';

import { isRiskySigil } from './core/sigil';
import type { LabelStyle, LevelFormat, ViewState } from './core/types';
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
			text: 'One format applied to every outline level (e.g. "1.2.1" from repeated Number style + Separator). Indent step and Space above still accumulate with depth, so deeper levels sit further right and further apart even though the format itself is shared.',
		});

		this.renderLevelSetting(containerEl);

		new Setting(containerEl).setName('Metadata fields').setHeading();
		containerEl.createEl('p', {
			cls: 'vo-fixture-note',
			text: 'Per-node fields (status, note, …) exposed to Dataview/Datacore and stored in the end-of-file %%md-outline block.',
		});
		this.renderMetaFields(containerEl);
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
