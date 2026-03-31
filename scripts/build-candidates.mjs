
import fs from "fs/promises";
import path from "path";
console.log("USING FILTERED BUILD");
const LOOKUP_PATH = path.resolve("public/data/web-lookup.json");
const OUTPUT_PATH = path.resolve("data/generated/passage-candidates.json");
const ALLOWED_BOOKS = new Set([
  "psalm",
  "proverbs",
  "matthew",
  "john",
  "romans",
  "philippians",
  "1_peter"
]);
function parseKey(key) {
  const [book_name, chapter, verse] = key.split("|");
  return {
    book_name,
    chapter: Number(chapter),
    verse: Number(verse),
  };
}

function makeReference(bookName, chapter, verseStart, verseEnd = null) {
  const displayBook = bookName
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  if (!verseEnd || verseEnd === verseStart) {
    return `${displayBook} ${chapter}:${verseStart}`;
  }

  return `${displayBook} ${chapter}:${verseStart}-${verseEnd}`;
}

function sortVerseEntries(entries) {
  return entries.sort((a, b) => {
    if (a.book_name !== b.book_name) return a.book_name.localeCompare(b.book_name);
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });
}

function groupByChapter(entries) {
  const map = new Map();

  for (const entry of entries) {
    const groupKey = `${entry.book_name}|${entry.chapter}`;
    if (!map.has(groupKey)) map.set(groupKey, []);
    map.get(groupKey).push(entry);
  }

  return map;
}

async function main() {
  const raw = await fs.readFile(LOOKUP_PATH, "utf8");
  const lookup = JSON.parse(raw);

  const verseEntries = Object.entries(lookup)
  .map(([key, text]) => {
    const parsed = parseKey(key);
    return {
      key,
      text,
      ...parsed,
    };
  })
  .filter(entry => ALLOWED_BOOKS.has(entry.book_name));

  sortVerseEntries(verseEntries);
  const byChapter = groupByChapter(verseEntries);

  const candidates = [];

  for (const [, verses] of byChapter.entries()) {
    for (let i = 0; i < verses.length; i++) {
      for (const length of [3]) {
        const slice = verses.slice(i, i + length);
        if (slice.length !== length) continue;

        const contiguous = slice.every((v, idx) =>
          idx === 0 ? true : v.verse === slice[idx - 1].verse + 1
        );

        if (!contiguous) continue;

        const first = slice[0];
        const last = slice[slice.length - 1];

        candidates.push({
          reference: makeReference(first.book_name, first.chapter, first.verse, last.verse),
          book_name: first.book_name,
          chapter: first.chapter,
          verse_start: first.verse,
          verse_end: first.verse === last.verse ? null : last.verse,
          text: slice.map(v => v.text.trim()).join(" "),
        });
      }
    }
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(candidates, null, 2));

  console.log(`Wrote ${candidates.length} passage candidates to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
