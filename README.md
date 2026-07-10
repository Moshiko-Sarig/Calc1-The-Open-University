# כספת אינפי 1

אתר סטטי מלא לקורס חשבון אינפיסימטלי 1.

> חשוב: עמוד ה-repository ב-GitHub מציג את README בלבד.  
> ה-UI המלא נמצא באתר GitHub Pages או בקבצי האתר תחת `docs/`.

## כניסה לאתר

אחרי הפעלת GitHub Pages:

[https://moshiko-sarig.github.io/Calc1-The-Open-University/](https://moshiko-sarig.github.io/Calc1-The-Open-University/)

אם הקישור מציג `404`, צריך להפעיל Pages:

1. Repository Settings
2. Pages
3. Build and deployment
4. Source: `Deploy from a branch`
5. Branch: `main`
6. Folder: `/docs`
7. Save

אפשר גם להשתמש ב-GitHub Actions, אבל `/docs` הכי פשוט כי כל האתר כבר בנוי ומחויב לריפו.

## מבנה האתר

- מקור UI מחוץ ל-Obsidian: [`web-app`](web-app)
- פרסום GitHub Pages: [`docs`](docs)
- מחולל תוכן מהכספת: [`tools/build-site.mjs`](tools/build-site.mjs)

קבצי ה-UI:

- HTML מקור: [`web-app/index.html`](web-app/index.html)
- CSS מקור: [`web-app/assets/site.css`](web-app/assets/site.css)
- JavaScript מקור: [`web-app/assets/app.js`](web-app/assets/app.js)
- HTML לפרסום: [`docs/index.html`](docs/index.html)
- CSS לפרסום: [`docs/assets/site.css`](docs/assets/site.css)
- JavaScript לפרסום: [`docs/assets/app.js`](docs/assets/app.js)
- תוכן האתר שנוצר מהכספת: [`docs/assets/content.js`](docs/assets/content.js)

## בנייה מקומית

```powershell
npm run build
npm run serve
```

השרת המקומי רץ על:

```text
http://127.0.0.1:4173/
```

## ייחוס

האתר הוא אתר לימודי לא רשמי. הפתקים מבוססים על חומרי הקורס 20474 של האוניברסיטה הפתוחה ועל סיכום הרצאות אינפי 1מ של אביב צנזור מהטכניון. כל הזכויות בחומרי המקור שמורות לבעליהן.

אין להעלות ציבורית ספרים, חוברות, PDFs רשמיים, הקלטות או פתרונות רשמיים ללא הרשאה מפורשת.
