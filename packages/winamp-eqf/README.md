# winamp-eqf

Odczyt i zapis presetów korektora Winampa (pliki `.eqf` i `winamp.q1`).

## Użycie

```typescript
import { parser, creator, EqfData } from "winamp-eqf";

// plik .eqf lub .q1 jako ArrayBuffer
const eqf: EqfData = parser(eqfArrayBuffer);

const buffer: ArrayBuffer = creator(eqf);
```

## API

Pakiet jest napisany w TypeScripcie i ma pełne definicje typów.

### `parser(ArrayBuffer): EqfData`

#### Zwracana wartość

```JavaScript
{
  "presets": [
    {
      "name": "Entry1",
      "preamp": 33, // 1-64
      "hz60": 64,   // 1-64
      "hz170": 64,  // ...
      "hz310": 64,
      "hz600": 64,
      "hz1000": 64,
      "hz3000": 64,
      "hz6000": 64,
      "hz12000": 64,
      "hz14000": 64,
      "hz16000": 64,
    },
    // Niektóre pliki, np. winamp.q1, zawierają kilka presetów.
  ],
  "type": "Winamp EQ library file v1.1",
}
```

### `creator(eqfObject: CreateEqfData): ArrayBuffer`

#### Zwracana wartość: `ArrayBuffer`

`eqfObject` ma taki sam kształt jak wynik `parser()`.

## Format pliku

Plik zaczyna się nagłówkiem `Winamp EQ library file v1.1\x1A!--`. Każdy preset to 257-bajtowa nazwa zakończona bajtem zerowym, 10 bajtów suwaków korektora (od najniższych do najwyższych częstotliwości) i 1 bajt wzmocnienia (preamp). Wartości mają zakres 0–63 i są odwrócone: `0x3F` to −12 dB, `0x1F` to 0 dB, `0` to +12 dB. Kolejne presety (np. w `winamp.q1`) następują bezpośrednio po sobie.
