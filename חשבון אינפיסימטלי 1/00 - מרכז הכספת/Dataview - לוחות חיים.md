---
tags: [אינפי1, dataview, dashboard]
aliases: [לוחות חיים, שאילתות Dataview]
---

# Dataview - לוחות חיים

<!-- codex-enhanced: 2026-07-10 -->

## פתקי יחידות

```dataview
TABLE WITHOUT ID file.link AS "פתק", file.folder AS "תיקייה", join(file.tags, ", ") AS "תגים"
FROM "יחידה 1 - המספרים הממשיים" OR "יחידה 2 - סדרות וגבולות" OR "יחידה 3 - חסמים וגבולות חלקיים" OR "יחידה 4 - גבולות של פונקציות" OR "יחידה 5 - פונקציות רציפות" OR "יחידה 6 - פונקציות מעריכיות" OR "יחידה 7 - הנגזרת" OR "יחידה 8 - תכונות פונקציות גזירות"
SORT file.folder ASC, file.name ASC
```

## שערים לחזרה

```dataview
TABLE WITHOUT ID file.link AS "שער", file.folder AS "יחידה"
FROM #review
WHERE contains(file.name, "שער יחידה")
SORT file.name ASC
```

## פתקים עם משפטים מרכזיים

```dataview
TABLE WITHOUT ID file.link AS "משפט", file.folder AS "יחידה"
FROM #משפט-מרכזי
SORT file.folder ASC, file.name ASC
```

## דוגמאות נגד ומלכודות

```dataview
LIST
FROM "00 - מרכז הכספת"
WHERE contains(file.name, "דוגמאות נגד")
```

