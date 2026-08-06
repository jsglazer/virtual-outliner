import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';

import { isRiskySigil, MAX_LEVEL } from './core/sigil';
import type { LabelStyle, ViewState } from './core/types';
import type VirtualOutlinerPlugin from './main';

const LABEL_STYLE_OPTIONS: Record<LabelStyle, string> = {
	'1': '1, 2, 3',
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
			text: 'Composite labels join one segment per level (e.g. "I.B.3") — each level below controls its own segment\'s style, separator, and typography.',
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

	private renderLevelSetting(containerEl: HTMLElement, level: number): void {
		const format = this.plugin.settings.levels[level - 1];
		if (!format) return;

		const setting = new Setting(containerEl).setName(`Level ${level}`);

		setting.addDropdown((dropdown) => {
			for (const [value, label] of Object.entries(LABEL_STYLE_OPTIONS)) dropdown.addOption(value, label);
			dropdown.setValue(format.style).onChange(async (value) => {
				format.style = value as LabelStyle;
				await this.plugin.saveSettings();
			});
		});
		setting.addText((text) => {
			text.setPlaceholder('Separator').setValue(format.separator);
			text.onChange(async (value) => {
				format.separator = value;
				await this.plugin.saveSettings();
			});
		});
		setting.addText((text) => {
			text.setPlaceholder('Font size').setValue(format.fontSize);
			text.onChange(async (value) => {
				format.fontSize = value;
				await this.plugin.saveSettings();
			});
		});
		setting.addText((text) => {
			text.setPlaceholder('Weight').setValue(format.fontWeight);
			text.onChange(async (value) => {
				format.fontWeight = value;
				await this.plugin.saveSettings();
			});
		});
		setting.addColorPicker((picker) => {
			if (format.color !== '') picker.setValue(format.color);
			picker.onChange(async (value) => {
				format.color = value;
				await this.plugin.saveSettings();
			});
		});
		setting.addToggle((toggle) => {
			toggle.setTooltip('Italic').setValue(format.italic);
			toggle.onChange(async (value) => {
				format.italic = value;
				await this.plugin.saveSettings();
			});
		});
		setting.addText((text) => {
			text.setPlaceholder('Indent step').setValue(format.indentStep);
			text.onChange(async (value) => {
				format.indentStep = value;
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
