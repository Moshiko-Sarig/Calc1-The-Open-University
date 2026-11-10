// The courses this site publishes. Everything that differs between courses
// lives here; tools/build-site.mjs and the client read it instead of constants.
// Paths are relative to the repository root (absolute paths also work).

// The home page at the root of the site, where the reader picks a course.
export const SITE = {
  name: "שואפים לאינסוף",
  mark: "∞",
  favicon: "infinity.svg",
  tagline: "אתר לימודי לא רשמי",
  intro: "מחברות לימוד לקורסי המתמטיקה של האוניברסיטה הפתוחה. הסברים פשוטים, המחשות ותרגול.",
  description: "שואפים לאינסוף הוא אתר לימודי לא רשמי לקורסי המתמטיקה של האוניברסיטה הפתוחה: סיכומים במילים פשוטות, הוכחות, המחשות ותרגול.",
  footerNotice: "אתר לימודי לא רשמי, ואינו של האוניברסיטה הפתוחה. כל הזכויות בחומרי המקור שמורות לבעליהן."
};

// Adding a course here is enough to give it its own site and a card on the home page.
export const COURSES = [
  {
    id: "infi",
    siteName: "אינפי 1",
    fullName: "חשבון אינפיניטסימלי 1",
    courseCode: "20474",
    tagline: "קורס 20474",
    summary: "מהמספרים הממשיים ועד תכונות של פונקציות גזירות: סיכומים, הוכחות, המחשות ומבחני עבר.",
    brandMark: "ε",
    favicon: "epsilon.svg",
    coverColor: "#1f4e79",
    description:
      "אתר לימודי לא רשמי לקורס 20474 חשבון אינפיניטסימלי 1 של האוניברסיטה הפתוחה: סיכומים לפי יחידות, 33 המשפטים לבחינה עם הוכחות מלאות, הסברים במילים פשוטות ו-45 מבחני עבר מתויגים.",
    notice:
      "אתר לימודי לא רשמי. הדפים מבוססים על חומרי הקורס 20474 של האוניברסיטה הפתוחה. כל הזכויות בחומרי המקור שמורות לבעליהן.",
    footerNotice:
      "אתר לימודי לא רשמי לקורס 20474 חשבון אינפיניטסימלי 1. מבוסס על ספרי הקורס של האוניברסיטה הפתוחה. כל הזכויות בחומרי המקור שמורות לבעליהן.",
    vaultDir: "חשבון אינפיסימטלי 1",
    outDir: "docs/infi",
    // The course that used to live at the root of the site: old links are sent here.
    legacyRoot: true,
    unitWord: "יחידה",
    words: {
      unit: "יחידה",
      units: "יחידות",
      theUnit: "היחידה",
      theUnits: "היחידות",
      unitsOf: "יחידות הקורס",
      inUnit: "ביחידה",
      toUnit: "ליחידה",
      studyUnits: "יחידות לימוד",
      oneUnit: "יחידה אחת",
      theorems: "משפטים לבחינה",
      theTheorems: "המשפטים לבחינה",
      theoremFromList: "משפט מהרשימה לבחינה"
    },
    demosLead: "גוררים, משנים את ε ורואים את ההגדרה עובדת",
    theoremBand:
      "בבחינה מבקשים להוכיח 2–3 משפטים מהרשימה הרשמית. לכל משפט יש באתר הוכחה מלאה עם כל הנימוקים, וליד כל הוכחה כתוב באילו מבחנים היא נשאלה.",
    sources: [
      'ספרי הקורס 20474 חשבון אינפיניטסימלי 1 של האוניברסיטה הפתוחה (ד"ר גיל אלון): כרך א (יחידות 1–3), כרך ב (יחידות 4–6), כרך ג (יחידות 7–8)',
      "חוברת ההגדרות והמשפטים של הקורס. מספרי ההגדרות והמשפטים בדפים אומתו מולה",
      "רשימת המשפטים לבחינה, וקובץ התיקונים הרשמי לספרים (עדכון 19.2.2024)",
      "סיכום מצגות המרצה במפגשי ההנחיה, ומסקנות משאלות הספר שהמרצה הפנה אליהן",
      "טפסי המבחנים הרשמיים 2019–2026 (סריקות, בלי פתרונות), בעמוד המבחנים"
    ],
    examUseNote: "בבחינה מצטטים רק משפטים, טענות, דוגמאות ושאלות מהספר. סיכומים חיצוניים, כולל האתר הזה, אינם מקור שמותר לצטט בלי הוכחה.",
    // Unit titles exactly as printed in the course books (20474, volumes A–C).
    // Vault folder names are kept for Obsidian links; the site shows these.
    unitTitles: {
      1: "המספרים הממשיים",
      2: "סדרות וגבולות",
      3: "קבוצות וסדרות חסומות",
      4: "גבולות של פונקציות",
      5: "פונקציות רציפות",
      6: "פונקציות מעריכיות",
      7: "הנגזרת",
      8: "תכונות של פונקציות גזירות"
    },
    unitVolumes: { 1: "כרך א", 2: "כרך א", 3: "כרך א", 4: "כרך ב", 5: "כרך ב", 6: "כרך ב", 7: "כרך ג", 8: "כרך ג" },
    titleSuffix: /\s+(?:-\s+|ב|בכספת )אינפי 1$/,
    searchExample: "5.29",
    storagePrefix: "infi",
    scripts: [],
    figuresDir: "figures",
    examsDir: "exams",
    theoremListTitle: "רשימת המשפטים לבחינה",
    theoremListLabel: "שברשימה לבחינה",
    features: { exams: true }
  },
  {
    id: "linear1",
    siteName: "לינארית 1",
    fullName: "אלגברה לינארית 1",
    courseCode: "20109",
    tagline: "קורס 20109",
    summary: "מערכות משוואות, וקטורים, בסיסים ומטריצות. פרקים 1–3 זמינים ללימוד.",
    brandMark: "λ",
    coverColor: "#2f5a4b",
    description:
      "אתר לימודי לא רשמי לקורס 20109 אלגברה לינארית 1 של האוניברסיטה הפתוחה: סיכומים לפי פרקים, הסברים פשוטים, המחשות אינטראקטיביות ותרגול.",
    notice:
      "אתר לימודי לא רשמי. הדפים נכתבו במילים שלנו ומפנים לספרי הקורס 20109 של האוניברסיטה הפתוחה. כל הזכויות בחומרי המקור שמורות לבעליהן.",
    footerNotice:
      "אתר לימודי לא רשמי לקורס 20109 אלגברה לינארית 1. הדפים נכתבו במילים שלנו ומפנים לספרי הקורס של האוניברסיטה הפתוחה. כל הזכויות בחומרי המקור שמורות לבעליהן.",
    vaultDir: "אלגברה לינארית 1",
    outDir: "docs/linear1",
    unitWord: "פרק",
    words: {
      unit: "פרק",
      units: "פרקים",
      theUnit: "הפרק",
      theUnits: "הפרקים",
      unitsOf: "פרקי הקורס",
      inUnit: "בפרק",
      toUnit: "לפרק",
      studyUnits: "פרקים",
      oneUnit: "פרק אחד",
      theorems: "משפטים",
      theTheorems: "המשפטים",
      theoremFromList: "משפט"
    },
    demosLead: "משנים ערך ורואים את הציור זז על דף המשבצות.",
    sources: [
      "ספרי הקורס 20109 אלגברה לינארית 1 של האוניברסיטה הפתוחה, מהדורה שנייה (פרופ' אלעד פארן; פרופ' דניאלה ליבוביץ השתתפה בכתיבת פרק 1). הדפים נכתבו במילים שלנו ומפנים לסעיפים בספר",
      "רשימת ההגדרות והמשפטים שבסוף הכרך. מספרי ההגדרות והמשפטים בדפים תואמים לה"
    ],
    examUseNote: "האתר הוא עזר ללימוד ואינו תחליף לספרי הקורס. מה מותר לצטט בבחינה בלי הוכחה נקבע בהנחיות הקורס, אז כדאי לבדוק שם.",
    unitTitles: {
      1: "מערכות משוואות לינאריות",
      2: "המרחב Fⁿ",
      3: "מטריצות",
      4: "דטרמיננטות"
    },
    unitVolumes: { 1: "כרך א", 2: "כרך א", 3: "כרך א", 4: "כרך א" },
    titleSuffix: /\s+-\s+לינארית 1$/,
    searchExample: "1.10.5",
    // Notes sort by name, so without this definition cards would not follow the book.
    sortStatementsByNumber: true,
    // The book numbers its notations too (סימון 3.3.1, סימון 3.9.2).
    extraStatementKinds: ["סימון"],
    storagePrefix: "linear1",
    scripts: ["linalg.js", "linear-archive.js"],
    archiveDir: "linear1-archive",
    figuresDir: null,
    examsDir: null,
    features: { exams: true, questionArchive: true }
  }
];
