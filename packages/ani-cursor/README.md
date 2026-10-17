# ani-cursor

Wyświetla w przeglądarce animowane kursory Windows (`.ani`) ze skórek Winampa: rozbiera plik na pojedyncze klatki i składa z nich animację CSS.

## Użycie

```js
import { convertAniBinaryToCSS } from "ani-cursor";

async function applyCursor(selector, aniUrl) {
  const response = await fetch(aniUrl);
  const data = new Uint8Array(await response.arrayBuffer());

  const style = document.createElement("style");
  style.innerText = convertAniBinaryToCSS(selector, data);
  document.head.appendChild(style);
}
```
