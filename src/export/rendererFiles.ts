// Every renderer file, as bundled text. Keys are paths relative to the
// installed renderer folder.

import jobPy from '../../renderer/job.py';
import libSh from '../../renderer/lib.sh';
import listsPy from '../../renderer/lists.py';
import preambleTex from '../../renderer/default-preamble.tex';
import quickActionSh from '../../renderer/quick-action.sh';
import renderSh from '../../renderer/render-pdf.sh';
import rowlinesPy from '../../renderer/rowlines.py';
import apaCsl from '../../renderer/styles/apa.csl';
import chicagoCsl from '../../renderer/styles/chicago.csl';
import chicagoNotesCsl from '../../renderer/styles/chicago-notes.csl';
import mlaCsl from '../../renderer/styles/mla.csl';
import tablesPy from '../../renderer/tables.py';
import wikilinksPy from '../../renderer/wikilinks.py';
import workflowInfo from '../../renderer/quickaction/Info.plist';
import workflowDocument from '../../renderer/quickaction/document.wflow';

export const RENDERER_FILES: Readonly<Record<string, string>> = {
	'render-pdf.sh': renderSh,
	'lib.sh': libSh,
	'job.py': jobPy,
	'tables.py': tablesPy,
	'lists.py': listsPy,
	'rowlines.py': rowlinesPy,
	'wikilinks.py': wikilinksPy,
	'quick-action.sh': quickActionSh,
	'default-preamble.tex': preambleTex,
	'styles/mla.csl': mlaCsl,
	'styles/apa.csl': apaCsl,
	'styles/chicago.csl': chicagoCsl,
	'styles/chicago-notes.csl': chicagoNotesCsl,
};

export const DEFAULT_PREAMBLE = preambleTex;

export const QUICK_ACTION_TEMPLATE = {
	info: workflowInfo,
	document: workflowDocument,
};
