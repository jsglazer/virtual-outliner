// Node/Electron modules, loaded lazily. The plugin also runs on mobile, where
// `require('fs')` throws — a top-level import would break the whole plugin
// there — so these are only ever called from desktop-gated code paths.

/* eslint-disable @typescript-eslint/no-require-imports, import/no-nodejs-modules, no-undef -- desktop-only PDF export needs fs/child_process, loaded lazily so mobile never evaluates them */

export interface NodeModules {
	fs: typeof import('fs');
	path: typeof import('path');
	os: typeof import('os');
	crypto: typeof import('crypto');
	childProcess: typeof import('child_process');
	process: typeof import('process');
}

let cached: NodeModules | null = null;

export function node(): NodeModules {
	if (cached === null) {
		cached = {
			fs: require('fs') as typeof import('fs'),
			path: require('path') as typeof import('path'),
			os: require('os') as typeof import('os'),
			crypto: require('crypto') as typeof import('crypto'),
			childProcess: require('child_process') as typeof import('child_process'),
			process: require('process') as typeof import('process'),
		};
	}
	return cached;
}

interface ElectronShell {
	openPath(path: string): Promise<string>;
	showItemInFolder(path: string): void;
}

export function electronShell(): ElectronShell | null {
	try {
		return (require('electron') as { shell: ElectronShell }).shell;
	} catch {
		return null;
	}
}
