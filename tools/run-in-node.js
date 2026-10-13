/* Run a page's scripts under Node with a fake browser (jsdom), for the VS Code "Launch Program" debugger.
   Usage: node tools/run-in-node.js [page]   e.g. node tools/run-in-node.js today   (default: log)
   Loads the same local scripts, in the same order, as the page's <script> tags. CDN scripts are skipped,
   so Supabase is treated as unavailable and load.html stops at its first Plotly chart. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const page = process.argv[2] || "log";
const htmlDir = path.join(__dirname, "..", "src", "HTML");
const html = fs.readFileSync(path.join(htmlDir, `${page}.html`), "utf8");
const dom = new JSDOM(html, { url: "http://localhost/" });

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;

const scripts = Array.from(dom.window.document.querySelectorAll("script[src]"))
    .map((script) => script.getAttribute("src"))
    .filter((src) => !/^https?:/.test(src));

// run each script in the shared global scope, like classic <script> tags in a browser
for (const src of scripts) {
    const file = path.join(htmlDir, src);
    vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

console.log(`Loaded ${page}.html scripts: ${scripts.join(", ") || "(none)"}`);
