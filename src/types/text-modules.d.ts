// Renderer files bundled into main.js as strings by esbuild's `text` loader
// (see esbuild.config.mjs) and written back out by the renderer installer.
declare module '*.sh' {
	const content: string;
	export default content;
}
declare module '*.py' {
	const content: string;
	export default content;
}
declare module '*.tex' {
	const content: string;
	export default content;
}
declare module '*.csl' {
	const content: string;
	export default content;
}
declare module '*.wflow' {
	const content: string;
	export default content;
}
declare module '*.plist' {
	const content: string;
	export default content;
}
