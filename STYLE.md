# Style guide: "in simple words" layer for the Calc 1 (20474) site

Repo: /Users/moshiko/Calc1-The-Open-University. Notes are Markdown in "חשבון אינפיסימטלי 1/יחידה N - .../*.md".
The owner approved the tone of two pilot pages. READ BOTH FULLY FIRST and imitate them exactly:
- "חשבון אינפיסימטלי 1/יחידה 2 - סדרות וגבולות/גבול של סדרה.md"
- "חשבון אינפיסימטלי 1/יחידה 5 - פונקציות רציפות/משפטי ויירשטראס.md"

## Goal
A weak, anxious student should be able to learn from the page almost as from a lecturer. The formal text stays; under it we add a friendly layer that lowers fear, builds intuition, and shows numbers. Never condescending, never "זה קל". Hebrew, plural address ("שימו לב", "תחשבו על"), short sentences.

## Box syntax (blockquote callouts; the site renders them)
```
> [!simple]- במילים פשוטות          ← folding box (the "-" makes it fold). Optional custom title after the type.
> line...
>
> next paragraph...

> [!plan]                           ← "התוכנית בשלוש שורות", open box, placed right BEFORE a proof
> 2–4 sentences: the idea of the proof in plain words.

> [!solution]- פתרון (א)            ← folding, one per self-check item / gate drill
> full worked solution

> [!exam] במבחן                     ← open box: how this appears in exams, with links to real questions
> ...
```
Rules:
- Every line of a box starts with "> ". Blank line inside a box = a line with just ">". A blank line (no ">") ends the box. Leave one empty line before and after each box.
- Tables and $math$ work inside boxes.
- NEVER put a box inside `<!-- infi-proof: N -->` … `<!-- /infi-proof -->`. Never move, delete or rename those markers or `<!-- infi-demo: ... -->` markers. Never change frontmatter or headings' theorem numbers.

## What every [!simple] box contains (4–10 lines, pick what fits)
1. **בשורה אחת** – the idea in everyday Hebrew, no quantifiers.
2. **תמונה בראש** – an everyday analogy (car parking, walking trail, thermometer, staircase, zoom on a map...). Must be mathematically honest.
3. **עם מספרים** – a tiny concrete example or a small table (e.g. ε=0.1 ⇒ N=11). Numbers MUST be correct: compute them.
4. **מה נשבר כשמורידים תנאי** – one counterexample per essential condition (for theorems).
5. Optional **אם זה נראה מפחיד** – one reassuring sentence that reframes the formal statement.
Where: under EVERY numbered definition and theorem/claim/lemma that a student must understand (skip trivial one-liners; group very small related items in one box). For each theorem with an infi-proof block also add a [!plan] box immediately before the `<!-- infi-proof` marker (or before the "### הוכחה" heading that precedes it).

## Also, in the same pass, on every page
- **Solutions**: every "בדיקה עצמית" item (in "## כרטיס דיוק") and every "## בדיקת שליטה" drill in gate pages gets a [!solution]- box with a complete worked answer, placed right after the bullet/list that asks it (outside the list; after the list ends). Correct, complete, exam-level.
- **Arrows**: ⟹ ⟸ ⟵ ⟶ ⇒ ⇐ written between Hebrew words (outside $...$) read backwards in RTL. Replace them with words: "ולכן", "גורר", "נובע ש", or a numbered sequence "(1) …, (2) …". Arrows inside $...$ are fine.
- **Jargon**: the first time a page uses זנב, רישא, קונטרפוזיציה, אינווריאנטה, באופן ריק, כמעט לכל, לאינסוף n-ים, explain it in a parenthesis in plain words.
- **Errors**: if you find a mathematical error, fix it, and list it in your final report.
- Units 6–8 only: also fill the missing content listed in your task.

## Exam layer
Exam data: /Users/moshiko/Calc1-The-Open-University/exams/exams.json (45 exams; each question has n, q, units, topics, prove, kind, summary, note). Link to a question as `[2022א·88, שאלה 1](#/exams/16/q1)` (exam n=16, q=1; label = semester·moed).
- In each unit gate page ("שער יחידה N.md"), add a section `## סוגי שאלות במבחן` before "## בדיקת שליטה": 3–6 bullets, each a recurring question type of this unit with 1–3 links to real exam questions and the one-line method. Base it on exams.json (filter by units).
- On content pages, for a theorem asked often, add one [!exam] box after the [!simple] box: how many times it was asked (count questions whose "prove" includes it) and 1–3 links.

## Sources for checking (plain text dumps, garbled RTL but searchable by theorem numbers)
/private/tmp/claude-501/-Users-moshiko-Calc1-The-Open-University/02bf6c29-e574-4fc7-8135-918673f87b65/scratchpad/txt/
- A.txt (volume א, units 1–3), B.txt (volume ב, units 4–6), C.txt (volume ג, units 7–8): grep the theorem number to check statements.
- lect.txt: lecturer's slide summary (methods he stresses, book questions he cites).
- bookq.txt: "conclusions from book questions" with a "בפשטות" style worth borrowing.
Do NOT copy paragraphs from the books; write in your own words. Course rule: only results from the course may be cited; Taylor and Technion material are out of scope.

## Do not
- Do not run git, do not commit, do not run the build (the lead will). Do not edit files outside your assigned folders.
- Do not touch the two pilot pages.
