// Run: node scripts/check-lyrics.ts  (Node strips the TS types)
import assert from "node:assert";
import { parseLyrics, activeLineIndex } from "../src/lib/lyrics.ts";

// plain text -> not synced, lines kept
const plain = parseLyrics("hello\nworld\n");
assert.equal(plain.synced, false);
assert.equal(plain.lines.length, 2);

// LRC -> synced, timestamps parsed and sorted
const lrc = parseLyrics("[00:10.50]second\n[00:01.00]first\n");
assert.equal(lrc.synced, true);
assert.equal(lrc.lines[0].text, "first");
assert.equal(lrc.lines[0].time, 1);
assert.equal(lrc.lines[1].time, 10.5);

// active line tracking
assert.equal(activeLineIndex(lrc.lines, 0), -1); // before first tag
assert.equal(activeLineIndex(lrc.lines, 5), 0);
assert.equal(activeLineIndex(lrc.lines, 11), 1);

// repeated tags on one line expand to multiple entries
const repeat = parseLyrics("[00:01.00][00:05.00]chorus\n");
assert.equal(repeat.lines.length, 2);

console.log("lyrics parser: all checks passed");

// Russian plural agreement — the counters read wrong for 1 and 21
import { plural } from "../src/lib/tracks.ts";
const t = (n: number) => plural(n, "трек", "трека", "треков");
assert.equal(t(1), "трек");
assert.equal(t(2), "трека");
assert.equal(t(4), "трека");
assert.equal(t(5), "треков");
assert.equal(t(11), "треков"); // the teens are all "many"
assert.equal(t(14), "треков");
assert.equal(t(21), "трек");
assert.equal(t(22), "трека");
assert.equal(t(51), "трек");
assert.equal(t(111), "треков");
assert.equal(t(0), "треков");
console.log("plurals: all checks passed");
