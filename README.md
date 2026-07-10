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

## קבצי האתר

- HTML: [`docs/index.html`](docs/index.html)
- CSS: [`docs/assets/site.css`](docs/assets/site.css)
- JavaScript: [`docs/assets/app.js`](docs/assets/app.js)
- תוכן האתר: [`docs/assets/content.js`](docs/assets/content.js)
- תמונות: [`docs/assets/figures`](docs/assets/figures)

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
