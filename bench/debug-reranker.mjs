#!/usr/bin/env node
// Debug the bge-reranker-base to understand why it's slow AND hurting quality.
// Tests: (1) one pair at a time, (2) batched pairs, (3) score interpretation.

import { AutoTokenizer, AutoModelForSequenceClassification } from '@xenova/transformers';

console.log('Loading Xenova/bge-reranker-base...');
const tokenizer = await AutoTokenizer.from_pretrained('Xenova/bge-reranker-base');
const model = await AutoModelForSequenceClassification.from_pretrained('Xenova/bge-reranker-base');
console.log('Loaded.\n');

// A known relevant pair and a known irrelevant pair from SciFact's domain
const query = '0-dimensional biomaterials show inductive properties.';
const relevant = 'Zero-dimensional (0-D) biomaterials like calcium phosphate nanoparticles are known to have inductive effects on stem cells, promoting osteogenic differentiation.';
const irrelevant = 'The migration patterns of Arctic terns span from pole to pole, making them one of the longest-traveling species in the world.';
const alsoRelevant = 'Calcium phosphate nanomaterials (0-D biomaterials) induce osteogenic differentiation in mesenchymal stem cells.';

// Test 1: Score one pair at a time
console.log('=== Test 1: single pair tokenization ===');
const t0 = Date.now();
const inputs1 = await tokenizer(query, {
  text_pair: relevant,
  padding: true,
  truncation: true,
  max_length: 512,
});
console.log('tokenized in', Date.now() - t0, 'ms');
console.log('input_ids shape:', inputs1.input_ids.dims);
console.log('input_ids[0] first 20:', Array.from(inputs1.input_ids.data.slice(0, 20)));

const t1 = Date.now();
const out1 = await model(inputs1);
console.log('model forward in', Date.now() - t1, 'ms');
console.log('logits keys:', Object.keys(out1));
console.log('logits dims:', out1.logits.dims);
console.log('logits data:', Array.from(out1.logits.data));

// Test 2: Score 3 pairs in a batch
console.log('\n=== Test 2: batch of 3 pairs ===');
const queries = [query, query, query];
const passages = [relevant, irrelevant, alsoRelevant];

const t2 = Date.now();
const inputs2 = await tokenizer(queries, {
  text_pair: passages,
  padding: true,
  truncation: true,
  max_length: 512,
});
console.log('batch tokenized in', Date.now() - t2, 'ms');
console.log('input_ids shape:', inputs2.input_ids.dims);

const t3 = Date.now();
const out2 = await model(inputs2);
console.log('batch model forward in', Date.now() - t3, 'ms');
console.log('logits dims:', out2.logits.dims);
console.log('logits data:', Array.from(out2.logits.data));
console.log('-> relevant should score HIGHEST (pair 0 or 2), irrelevant LOWEST (pair 1)');

// Test 3: Score each pair separately, compare with batch
console.log('\n=== Test 3: score each pair one-by-one ===');
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  const inp = await tokenizer(queries[i], {
    text_pair: passages[i],
    padding: true,
    truncation: true,
    max_length: 512,
  });
  const o = await model(inp);
  const score = Number(o.logits.data[0]);
  const label = i === 1 ? 'IRRELEVANT' : 'RELEVANT  ';
  console.log(`  [${label}] score=${score.toFixed(4)}  (${Date.now() - t}ms)`);
}

console.log('\nDone.');
