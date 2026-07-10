---
tags: [אינפי1, גרפים, desmos, mathematica-plot]
aliases: [Mathematica Plot אינפי, גלריית גרפים, גרפים דינמיים]
---

# גרפים דינמיים - Mathematica Plot

<!-- codex-enhanced: 2026-07-10 -->

> Mathematica Plot דורש `wolframscript.exe` מותקן במחשב. כרגע הוא לא נמצא, לכן העמוד משתמש ב-`desmos-live` יציב עד התקנת WolframScript.

## $\sin x / x$ ליד אפס

```desmos-live
{
  "version": 10,
  "randomSeed": "mathematica-fallback-sinx-over-x",
  "graph": {
    "viewport": {
      "xmin": -8,
      "ymin": -1.4,
      "xmax": 8,
      "ymax": 1.4
    }
  },
  "expressions": {
    "list": [
      {
        "id": "f",
        "type": "expression",
        "latex": "f(x)=\\frac{\\sin x}{x}",
        "color": "#2d70b3"
      },
      {
        "id": "target",
        "type": "expression",
        "latex": "y=1",
        "color": "#c74440",
        "lineStyle": "DASHED"
      },
      {
        "id": "zeroHole",
        "type": "expression",
        "latex": "(0,1)",
        "color": "#388c46",
        "showLabel": true,
        "label": "\\lim_{x\\to0}\\frac{\\sin x}{x}=1"
      }
    ]
  }
}
```

הנקודה החשובה: הערך ב-$x=0$ לא משנה את הגבול. הגרף מציג התקרבות לערך $1$ משני הצדדים.

## משפט ערך הביניים - חציית ציר

```desmos-live
{
  "version": 10,
  "randomSeed": "mathematica-fallback-ivt-root",
  "graph": {
    "viewport": {
      "xmin": 0,
      "ymin": -1.5,
      "xmax": 1.4,
      "ymax": 1.5
    }
  },
  "expressions": {
    "list": [
      {
        "id": "f",
        "type": "expression",
        "latex": "f(x)=x^3+x-1",
        "color": "#2d70b3"
      },
      {
        "id": "axis",
        "type": "expression",
        "latex": "y=0",
        "color": "#666666",
        "lineStyle": "DASHED"
      },
      {
        "id": "a",
        "type": "expression",
        "latex": "(0,f(0))",
        "color": "#c74440",
        "showLabel": true,
        "label": "f(0)<0"
      },
      {
        "id": "b",
        "type": "expression",
        "latex": "(1,f(1))",
        "color": "#388c46",
        "showLabel": true,
        "label": "f(1)>0"
      }
    ]
  }
}
```

הנקודה החשובה: רציפות ושינוי סימן על $[0,1]$ מחייבים שורש בתוך הקטע.

## קמירות ופיתול

```desmos-live
{
  "version": 10,
  "randomSeed": "mathematica-fallback-inflection",
  "graph": {
    "viewport": {
      "xmin": -2.5,
      "ymin": -5,
      "xmax": 2.5,
      "ymax": 5
    }
  },
  "expressions": {
    "list": [
      {
        "id": "f",
        "type": "expression",
        "latex": "f(x)=x^3",
        "color": "#6042a6"
      },
      {
        "id": "axis",
        "type": "expression",
        "latex": "y=0",
        "color": "#666666",
        "lineStyle": "DASHED"
      },
      {
        "id": "p",
        "type": "expression",
        "latex": "(0,0)",
        "color": "#c74440",
        "showLabel": true,
        "label": "f''(0)=0"
      }
    ]
  }
}
```

הנקודה החשובה: ב-$x^3$ הקמירות משתנה סביב $0$, לכן זו נקודת פיתול.

## משיק משתנה

```desmos-live
{
  "version": 10,
  "randomSeed": "mathematica-fallback-moving-tangent",
  "graph": {
    "viewport": {
      "xmin": -4,
      "ymin": -6,
      "xmax": 4,
      "ymax": 6
    }
  },
  "expressions": {
    "list": [
      {
        "id": "a",
        "type": "expression",
        "latex": "a=1",
        "sliderBounds": {
          "min": -2.5,
          "max": 2.5,
          "step": 0.1
        }
      },
      {
        "id": "f",
        "type": "expression",
        "latex": "f(x)=x^3-3x+1",
        "color": "#2d70b3"
      },
      {
        "id": "p",
        "type": "expression",
        "latex": "(a,f(a))",
        "color": "#388c46",
        "showLabel": true,
        "label": "a"
      },
      {
        "id": "t",
        "type": "expression",
        "latex": "y=f'(a)(x-a)+f(a)",
        "color": "#c74440"
      }
    ]
  }
}
```

הנקודה החשובה: הזזת $a$ ממחישה שנגזרת היא שיפוע המשיק המקומי.

## אם רוצים להחזיר Mathematica Plot

צריך להתקין WolframScript, ואז להגדיר:

- Settings -> Mathematica Plot -> WolframScript path
- או להשאיר ריק רק אם `wolframscript.exe` זמין ב-PATH

## קשרים

- [[הגבול של sin x חלקי x]]
- [[משפט ערך הביניים]]
- [[קמירות ונקודות פיתול]]
- [[הגדרת הנגזרת]]
