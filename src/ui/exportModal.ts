// "Export to PDF" dialog: font size (the kept prompt), per-export overrides of
// the note's frontmatter options, where the PDF will go, and anything written
// on outline entry lines that the export will drop. Changes here apply to this
// export only; the note itself is never edited.

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import type { LostKind } from '../core/exportBody';
import { CITE_STYLES, FONT_SIZES } from '../core/exportOptions';
import type { ExportPlan } from '../export/exporter';

const LOST_LABELS: Record<LostKind, string> = {
	footnote: 'footnote',
	citation: 'citation',
	link: 'link',
	embed: 'embed',
};

export class ExportPdfModal extends Modal {
	private submitted = false;

	// Rebuilt whenever the output path changes, so the path line and the
	// "already exists" warning always describe the file that will be written.
	private whereEl: HTMLElement | null = null;

	constructor(
		app: App,
		private plan: ExportPlan,
		private onSubmit: (plan: ExportPlan) => void,
		// Points the plan at `<name><suffix>.pdf` and re-answers the collision
		// question for that name (PdfExporter.retarget).
		private retarget: (suffix: string) => void,
		// What a Submit export offers to append, remembered from last time.
		private defaultSuffix: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, plan } = this;
		this.setTitle(`Export "${plan.file.basename}" to PDF`);
		contentEl.addClass('vo-export-modal');

		// Declared before the Version dropdown that shows and hides it, so the
		// dropdown's handler can reach it; `.settingEl` is what actually moves.
		let suffixInput: { setValue: (v: string) => void } | null = null;
		const suffixSetting = new Setting(contentEl)
			.setName('Append to file name')
			.setDesc('A Submit copy usually wants a name of its own — this is added before ".pdf".')
			.addText((text) => {
				// Not UI prose but a literal file-name suffix, so it keeps its
				// capital S — the sentence-case rule does not apply.
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				text.setPlaceholder('-Submit')
					.setValue(plan.nameSuffix)
					.onChange((v) => {
						this.retarget(v);
						this.renderWhere();
					});
				suffixInput = text;
			});
		suffixSetting.settingEl.hidden = plan.variant !== 'submit';

		const versionSetting = new Setting(contentEl)
			.setName('Version')
			.setDesc('Dev keeps the date/time stamp; Submit drops it and centres the page count')
			.addDropdown((dd) =>
				dd
					.addOption('dev', 'Dev')
					.addOption('submit', 'Submit')
					.setValue(plan.variant)
					.onChange((v) => {
						plan.variant = v === 'submit' ? 'submit' : 'dev';
						const submit = plan.variant === 'submit';
						suffixSetting.settingEl.hidden = !submit;
						// Switching to Submit offers the remembered suffix;
						// switching back to Dev writes the plain name again.
						const suffix = submit ? (plan.nameSuffix !== '' ? plan.nameSuffix : this.defaultSuffix) : '';
						suffixInput?.setValue(suffix);
						this.retarget(suffix);
						this.renderWhere();
					}),
			);
		// Built first (the dropdown's handler closes over it), shown second.
		versionSetting.settingEl.after(suffixSetting.settingEl);
		new Setting(contentEl)
			.setName('Line numbers')
			.setDesc('Dev only: each body line\'s editor line number, in the left margin')
			.addToggle((t) => t.setValue(plan.lineNumbers).onChange((v) => (plan.lineNumbers = v)));
		new Setting(contentEl).setName('Font size').addDropdown((dd) => {
			for (const size of FONT_SIZES) dd.addOption(size, `${size} pt`);
			dd.setValue(plan.fontsize).onChange((v) => (plan.fontsize = v));
		});
		new Setting(contentEl)
			.setName('Number headings')
			.setDesc('Frontmatter: headnum')
			.addToggle((t) => t.setValue(plan.options.headnum).onChange((v) => (plan.options.headnum = v)));
		new Setting(contentEl)
			.setName('Table of contents')
			.setDesc('Frontmatter: TOC')
			.addToggle((t) => t.setValue(plan.options.toc).onChange((v) => (plan.options.toc = v)));
		new Setting(contentEl)
			.setName('Notes')
			.setDesc('Frontmatter: notes (e or f)')
			.addDropdown((dd) =>
				dd
					.addOption('f', 'Footnotes at the bottom of the page')
					.addOption('e', 'Endnotes at the end of the document')
					.setValue(plan.options.notes)
					.onChange((v) => (plan.options.notes = v === 'e' ? 'e' : 'f')),
			);
		new Setting(contentEl)
			.setName('Citation style')
			.setDesc('Frontmatter: cite — used only when the note cites sources')
			.addDropdown((dd) => {
				for (const style of CITE_STYLES) dd.addOption(style, style.replace('-', ' '));
				if (!CITE_STYLES.some((s) => s.toLowerCase() === plan.options.cite.toLowerCase())) {
					dd.addOption(plan.options.cite, plan.options.cite);
				}
				const match = CITE_STYLES.find((s) => s.toLowerCase() === plan.options.cite.toLowerCase());
				dd.setValue(match ?? plan.options.cite).onChange((v) => (plan.options.cite = v));
			});

		this.whereEl = contentEl.createDiv({ cls: 'vo-export-where' });
		this.renderWhere();

		if (plan.extraction.lost.length > 0) {
			const warn = contentEl.createDiv({ cls: 'vo-export-warnings' });
			warn.createDiv({ text: 'Written on outline entries, so left out of the PDF:', cls: 'vo-export-label' });
			const list = warn.createEl('ul');
			for (const item of plan.extraction.lost) {
				const kinds = item.kinds.map((k) => LOST_LABELS[k]).join(', ');
				list.createEl('li', { text: `Line ${item.line + 1} — ${kinds}: ${item.text}` });
			}
		}

		new Setting(contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText('Export')
					.setCta()
					.onClick(() => this.submit()),
			);
		this.scope.register([], 'Enter', (evt) => {
			evt.preventDefault();
			this.submit();
			return false;
		});
	}

	// The Output block: where the PDF goes, the collision choice when something
	// is already there, and where the preamble came from.
	private renderWhere(): void {
		const where = this.whereEl;
		if (!where) return;
		const { plan } = this;
		where.empty();
		where.createDiv({ text: 'Output', cls: 'vo-export-label' });
		const pathEl = where.createDiv({ text: plan.outputPath, cls: 'vo-export-path' });
		const { collision } = plan;
		if (collision !== null) {
			const name = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
			const alert = where.createDiv({ cls: 'vo-export-collision' });
			alert.createDiv({ text: `${name(collision.existing)} already exists and will be replaced.`, cls: 'vo-export-label' });
			new Setting(alert).setName('If the file exists').addDropdown((dd) =>
				dd
					.addOption('overwrite', `Overwrite ${name(collision.existing)}`)
					.addOption('number', `Save as ${name(collision.numbered)}`)
					.setValue(plan.overwrite ? 'overwrite' : 'number')
					.onChange((v) => {
						plan.overwrite = v === 'overwrite';
						plan.outputPath = plan.overwrite ? collision.existing : collision.numbered;
						pathEl.setText(plan.outputPath);
					}),
			);
		}
		where.createDiv({
			text: plan.options.pdfOutput !== '' ? 'From the note\'s pdf-output.' : 'Beside the note. Set pdf-output: in the frontmatter to change it.',
			cls: 'setting-item-description',
		});
		where.createDiv({ text: `Preamble: ${plan.preambleSource}`, cls: 'setting-item-description' });
	}

	private submit(): void {
		if (this.submitted) return;
		this.submitted = true;
		this.close();
		this.onSubmit(this.plan);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class ExportErrorModal extends Modal {
	constructor(
		app: App,
		private stage: string,
		private message: string,
		private buildDir: string | null,
		private logPath: string | null,
		private openPath: (path: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle('PDF export failed');
		contentEl.addClass('vo-export-modal');
		contentEl.createDiv({ text: `Stage: ${this.stage}`, cls: 'setting-item-description' });
		contentEl.createEl('pre', { text: this.message, cls: 'vo-export-error' });
		if (this.buildDir !== null) {
			contentEl.createDiv({ text: `Build files were kept in ${this.buildDir}`, cls: 'setting-item-description' });
		}
		const buttons = new Setting(contentEl);
		const { buildDir, logPath } = this;
		if (buildDir !== null) buttons.addButton((b) => b.setButtonText('Open build folder').onClick(() => this.openPath(buildDir)));
		if (logPath !== null) buttons.addButton((b) => b.setButtonText('Open log').onClick(() => this.openPath(logPath)));
		buttons.addButton((b) =>
			b
				.setButtonText('Close')
				.setCta()
				.onClick(() => this.close()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
