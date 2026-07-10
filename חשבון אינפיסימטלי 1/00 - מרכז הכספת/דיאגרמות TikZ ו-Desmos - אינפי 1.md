---
tags: [אינפי1, obsidian, plugins, diagrams, desmos, tikz]
aliases: [TikZ ו-Desmos לאינפי 1, גרפים חיים, דיאגרמות אינפי]
---

# דיאגרמות TikZ ו-Desmos - אינפי 1

<!-- codex-enhanced: 2026-07-10 -->

הדף הזה מרכז תבניות מוכנות לשני הפלאגינים החדשים:

- `desmos-live` לגרפים אינטראקטיביים עם סליידרים.
- `tikz` לדיאגרמות מדויקות שנשמרות כקוד בתוך הפתק.

## גבול יסודי: $\lim_{x\to0}\frac{\sin x}{x}=1$

```desmos-live
{
  "version": 10,
  "randomSeed": "infi-limit-sinx-over-x",
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
        "id": "point",
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

כיוון קריאה: הגרף לא מגדיר את הערך בנקודה $0$, אלא מציג את ההתקרבות לערך $1$ משני הצדדים.

## משיק משתנה ונגזרת

```desmos-live
{
  "version": 10,
  "randomSeed": "infi-moving-tangent",
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
        "id": "tangent",
        "type": "expression",
        "latex": "y=f'(a)(x-a)+f(a)",
        "color": "#c74440"
      }
    ]
  }
}
```

כיוון קריאה: הזזת $a$ מראה שהנגזרת היא שיפוע המשיק המקומי, לא שיפוע מיתר גלובלי.

## משפט ערך הביניים

```desmos-live
{
  "version": 10,
  "randomSeed": "infi-ivt",
  "graph": {
    "viewport": {
      "xmin": 0,
      "ymin": -2,
      "xmax": 3,
      "ymax": 5
    }
  },
  "expressions": {
    "list": [
      {
        "id": "f",
        "type": "expression",
        "latex": "f(x)=x^3-x-1",
        "color": "#2d70b3"
      },
      {
        "id": "zero",
        "type": "expression",
        "latex": "y=0",
        "color": "#666666",
        "lineStyle": "DASHED"
      },
      {
        "id": "left",
        "type": "expression",
        "latex": "(1,f(1))",
        "color": "#c74440",
        "showLabel": true,
        "label": "f(1)<0"
      },
      {
        "id": "right",
        "type": "expression",
        "latex": "(2,f(2))",
        "color": "#388c46",
        "showLabel": true,
        "label": "f(2)>0"
      }
    ]
  }
}
```

כיוון קריאה: רציפות על $[1,2]$ ושינוי סימן מחייבים שורש בקטע.

## סביבת $\varepsilon$-$\delta$

```tikz
\begin{document}
\begin{tikzpicture}[x=1.05cm,y=1.05cm]
  \draw[->] (-0.4,0) -- (6.2,0) node[right] {$x$};
  \draw[->] (0,-0.3) -- (0,4.2) node[above] {$y$};

  \draw[blue,thick] (0.4,2.55)
    .. controls (1.5,1.85) and (2.4,1.55) .. (3,1.55)
    .. controls (3.6,1.55) and (4.7,1.85) .. (5.6,2.55);

  \draw[dashed] (3,0) node[below] {$a$} -- (3,1.55) -- (0,1.55) node[left] {$L$};
  \draw[red,thick] (0,1.15) -- (6,1.15);
  \draw[red,thick] (0,1.95) -- (6,1.95);
  \node[red,left] at (0,1.95) {$L+\varepsilon$};
  \node[red,left] at (0,1.15) {$L-\varepsilon$};

  \draw[green,very thick] (2.25,0) -- (3.75,0);
  \node[green,below] at (2.25,0) {$a-\delta$};
  \node[green,below] at (3.75,0) {$a+\delta$};

  \fill[blue] (3,1.55) circle (2pt);
  \node at (4.75,3.35) {$0<|x-a|<\delta \Rightarrow |f(x)-L|<\varepsilon$};
\end{tikzpicture}
\end{document}
```

כיוון קריאה: ה-$\delta$ הוא בחירה על ציר $x$ שמבטיחה להישאר בתוך פס ה-$\varepsilon$ סביב $L$.

## קטעים מקוננים

```tikz
\begin{document}
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[->] (-0.4,0) -- (7.5,0) node[right] {$R$};

  \draw[very thick,blue] (0.5,0) -- (7,0);
  \fill[blue] (0.5,0) circle (2pt);
  \fill[blue] (7,0) circle (2pt);
  \node[blue,above] at (3.75,0.15) {$I_1$};

  \draw[very thick,green] (1.4,-0.55) -- (6.2,-0.55);
  \fill[green] (1.4,-0.55) circle (2pt);
  \fill[green] (6.2,-0.55) circle (2pt);
  \node[green,above] at (3.8,-0.4) {$I_2$};

  \draw[very thick,black] (2.1,-1.1) -- (5.35,-1.1);
  \fill[black] (2.1,-1.1) circle (2pt);
  \fill[black] (5.35,-1.1) circle (2pt);
  \node[above] at (3.75,-0.95) {$I_3$};

  \draw[very thick,red] (3.1,-1.65) -- (4.2,-1.65);
  \fill[red] (3.1,-1.65) circle (2pt);
  \fill[red] (4.2,-1.65) circle (2pt);
  \node[red,above] at (3.65,-1.5) {$I_n$};

  \draw[dashed] (3.65,0.25) -- (3.65,-1.9);
  \node[below] at (3.65,-1.9) {$c \in \bigcap_{n=1}^{\infty} I_n$};
\end{tikzpicture}
\end{document}
```

כיוון קריאה: כשיש שרשרת קטעים סגורים מקוננים ואורכים ששואפים לאפס, הנקודה המשותפת יחידה.

## משפט לגראנז'

```tikz
\begin{document}
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[->] (-0.2,0) -- (6.2,0) node[right] {$x$};
  \draw[->] (0,-0.2) -- (0,4.5) node[above] {$y$};

  \draw[blue,thick] (1,1.87)
    .. controls (1.8,1.45) and (2.6,2.05) .. (3.1,2.605)
    .. controls (3.8,3.35) and (4.5,3.55) .. (5,3.27);

  \coordinate (A) at (1,1.87);
  \coordinate (B) at (5,3.27);
  \draw[red,thick] (A) -- (B);
  \fill[red] (A) circle (2pt) node[below left] {$a$};
  \fill[red] (B) circle (2pt) node[above right] {$b$};

  \draw[green,thick] (2.1,2.255) -- (4.1,2.955);
  \fill[green] (3.1,2.605) circle (2pt) node[above] {$c$};

  \node at (3.3,4.0) {$f'(c)=\dfrac{f(b)-f(a)}{b-a}$};
\end{tikzpicture}
\end{document}
```

כיוון קריאה: משפט לגראנז' מבטיח נקודה שבה שיפוע המשיק שווה לשיפוע המיתר.
