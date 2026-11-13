# Exam solutions: file format

One Markdown file per exam: `exams/solutions/<n>.md`, where `<n>` is the exam's
`n` in `exams/exams.json`. The build reads these files and the exam page shows
them next to the scans, in study mode. `41.md` is the reference example: copy
its structure and its tone.

All solutions are written by us, from the scans. Never copy a solution from
another site or book. The question text may be transcribed from the scan.

## Layout

```
---
exam: 41
---

## שאלה 3

> [!question] השאלה
> The question as printed, transcribed from the scan. Math in $...$.

### סעיף א

> [!simple]- במילים פשוטות
> **בשורה אחת**: ...
> **תמונה בראש**: ...
> **עם מספרים**: ...

> [!graph]- רואים את זה בגרף
> What to move and what to watch, in plain words.
>
> ```desmos-live
> { ...the graph JSON, see 41.md... }
> ```

> [!hint]- רמז 1: מאיפה מתחילים
> ...
> [!hint]- רמז 2: ...
> [!plan]
> ...
> [!solution]- פתרון מלא
> ...
> [!mistake]- טעויות נפוצות
> ...

**שאלות דומות**: [2024א · מועד 81, שאלה 2](#/exams/29/q2)
```

## The most important rule: explain it so a child could follow

The owner's first priority: every solution must be explained so simply that a
5-year-old could follow the idea. The reader is a student who is afraid of
math. The formal, exam-level solution stays (it is what goes in the exam
notebook), but it is never the only explanation:

- **Every part opens with a `[!simple]- במילים פשוטות` box**, right after the `### סעיף` heading (or after the `[!question]` box when there are no parts), before the hints. It contains:
  - `**בשורה אחת**: ...` what the question really asks, in everyday words, with no symbols if possible.
  - `**תמונה בראש**: ...` an everyday picture (stairs, a path going uphill, a light blinking, children in a line) that is mathematically honest.
  - `**עם מספרים**: ...` the idea on two or three small, concrete numbers. Compute them; they must be correct.
  - Each scary word used in the solution (אינפימום, רציפות במידה שווה, סדרת קושי...) explained in one plain sentence.
- **Every `*למה?*` line uses everyday words**, as if answering a child who asked "but why?". No new symbols inside it.
- **Hints and plan in plain words too.** Name the theorem, but say in words what it gives.
- **Short sentences.** One idea per sentence. Explain every new term the first time it appears.
- Simple, never condescending: no "זה קל", no "ברור ש".

## See it: a graph in every part where a picture helps

Right after the `[!simple]` box, add a `[!graph]- רואים את זה בגרף` box (up to two per part). The site draws it as an interactive graph on the notebook grid. Add one to every part that involves a function, a sequence, an interval or a set of numbers. Leave it out only when no picture fits, such as a pure counting or logic question; the checker warns when it is missing.

Inside the box: 1 to 3 sentences saying exactly what to look at and what to move ("הזיזו את $c$ ועקבו אחרי..."), in the same plain words as the simple box, then one of these:

- A ` ```desmos-live ` block of JSON, every line prefixed with `> ` like the rest of the box (see 41.md). The engine understands: `f(x)=...` and `y=...` curves; `x=...` vertical lines; points `(a,b)`, which may use sliders, as in `(t,f(t))`; and sliders `a=1` with `"sliderBounds": {"min","max","step"}`. Per item you can set `"color"` (blue `#2d70b3`, red `#c74440`, green `#388c46`, gray `#6b6b6b`), `"lineStyle": "DASHED"` or `"DOTTED"`, `"pointStyle": "OPEN"` for a hollow point, and `"showLabel": true`. Write multiplication explicitly (`x\\cdot e^{-x}`), and escape backslashes in JSON (`\\frac{1}{x}`). Choose the viewport so the interesting part fills the picture.
- An `<!-- infi-demo: name -->` marker, for one of the site's ready-made animations: `epsilon-n` (sequence limit), `epsilon-delta` (function limit), `sup` (supremum), `nested-intervals`, `bisection` (intermediate value), `uniform` (uniform continuity), `secant`, `tangent`, `mvt` (Rolle and Lagrange), `inverse-mirror`, `transform`. Use these for proofs of theorems.

Good graphs show the idea of the solution, not only the function. For example: the counterexample, with the point where the claim breaks; the horizontal line of the intermediate value theorem; the two sequences of Heine converging to the same point; the tangent line Lagrange promises. Every number in the graph must match the solution.

Rules:

- `## שאלה N` starts a question, with N equal to `q` in exams.json. Every question of the exam gets a section, in order.
- A question with parts has one `### סעיף א` / `### סעיף ב` per part, and each part has its own hint, plan, solution and mistake boxes. A question without parts puts them directly under the question.
- **Hints**: 2 or 3 `[!hint]-` boxes, from soft to strong. Hint 1 says where to look (what kind of question this is, which definition). Hint 2 names the tool (the theorem by number, the trick). Hint 3 gives the key step but not the whole solution. Titles: `רמז 1: ...`, `רמז 2: ...`, `רמז 3: ...` with a short label after the colon.
- **Plan** (`[!plan]`, open): 2 to 4 sentences, the idea of the whole solution in plain words.
- **Solution** (`[!solution]- פתרון מלא`): complete and exam-level, the way a student should write it in the notebook. Break it into bold-headed steps (`**שלב 1: ...**`). After each step whose reason is not obvious, add one line starting with `*למה?*` that explains why it works or why we chose it. Cite theorems by number ("משפט 5.48"): the site turns them into links.
- **Mistakes** (`[!mistake]- טעויות נפוצות`): 2 to 4 bullets. Real mistakes students make here, and what the grader takes points off for.
- **Similar questions**: an optional line at the end of the question, linking other exams' questions of the same type (`#/exams/<n>/q<k>`). Use exams.json tags to find them; link only ones you checked.
- **Proof of a theorem from the list** ("הוכיחו את משפט 5.48"): the hints and the plan still apply. The solution is the full proof.
- **Prove or refute** ("הוכיחו או הפריכו"): the first line of the solution is `**התשובה: נכון**` or `**התשובה: לא נכון**`, then the proof or the counterexample, with the counterexample checked against every condition.

## Multiple choice (חלק ב)

Same layout, plus one machine-readable line right after the `## שאלה N` heading:

```
<!-- mc: 1=true 2=false -->
```

It gives the truth value of each numbered statement in the question, and the site's trainer checks the student's answers against it. The solution then has one bold-headed step for each statement, saying whether it is true and why (a proof, or a counterexample). End with `**התשובה במבחן**: ...` naming which statements are correct. If the scan lists lettered options (א–ה), name the correct letter too.

If a question is not of the "statements 1, 2" form (for example, "what is the limit"), write `<!-- mc: answer=<letter> -->` instead.

## Language and math

Follow `STYLE.md`: Hebrew, plural address ("שימו לב"), short sentences, calm tone (no "ברור ש", "קל לראות", "חובה"). No arrows between Hebrew words outside `$...$`; write "ולכן" or "נובע ש". Display math in `$$...$$` on its own line inside the box (`> $$...$$`). Every computed number must be correct: check it.

Every line of a box starts with `> `, a blank line inside a box is a line with just `>`, and an empty line ends the box. Leave an empty line between boxes.
