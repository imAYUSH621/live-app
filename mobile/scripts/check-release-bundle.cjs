// Regression guard for Expo 52 release-bundle dependency shapes.
// Usage: node scripts/check-release-bundle.cjs /path/to/exported-entry.js
// Executes the actual bundled modules in isolation; not an emulator/media test.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const parser=require('@babel/parser');
const source=fs.readFileSync(process.argv[2],'utf8');
const ast=parser.parse(source,{sourceType:'script'}), registry=new Map(), cache=new Map();
for(const node of ast.program.body){
 const e=node.expression;
 if(e?.type!=='CallExpression'||e.callee?.name!=='__d') continue;
 const [fn,id,deps]=e.arguments;
 registry.set(id.value,{code:source.slice(fn.start,fn.end),deps:deps.elements.map(x=>x.value)});
}
const sandbox=vm.createContext({console,setTimeout,clearTimeout,Symbol,URL,TextEncoder,TextDecoder});
function load(id){
 if(cache.has(id)) return cache.get(id).exports;
 const def=registry.get(id); if(!def) throw Error('Missing bundled module '+id);
 const m={exports:{}}; cache.set(id,m);
 const fn=vm.runInContext('('+def.code+')',sandbox);
 fn(sandbox,load,x=>load(x),x=>load(x),m,m.exports,def.deps);
 return m.exports;
}
const fork=[...registry.values()].find(x=>x.code.includes('e.getPathDataFromState='));
assert(fork,'router fork found');
const qs=load(fork.deps[1]);
assert.equal(typeof qs.stringify,'function','CJS fork must receive named stringify');
assert.equal(qs.stringify({id:'7',q:'a b'},{sort:false}),'id=7&q=a%20b');
console.log('PASS actual bundle query-string stringify with dynamic params');
const runtime=[...registry.values()].find(x=>x.code.includes('wrapFetchWithWindowLocation'));
assert(runtime,'Expo runtime found');
assert(runtime.deps[9]!==undefined,'ReadableStream lazy getter dependency must exist');
assert.equal(typeof load(runtime.deps[9]).ReadableStream,'function');
console.log('PASS actual bundle ReadableStream dependency resolves to constructor');
