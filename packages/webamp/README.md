# Silnik odtwarzacza

Silnik Winampa 2 używany przez stronę win-amp.pl: okna odtwarzacza, korektora i listy odtwarzania, obsługa skórek `.wsz`, wizualizacje, skróty klawiszowe i menu kontekstowe.

Autor: [warsztatcyfrowy.pl](https://warsztatcyfrowy.pl)

## Praca nad silnikiem

Strona w `packages/webamp-demo` wczytuje kod silnika bezpośrednio ze źródeł, więc najwygodniej pracować przy uruchomionej stronie:

    cd packages/webamp-demo
    pnpm start

## Testy

    cd packages/webamp
    pnpm test        # testy
    pnpm test -u     # aktualizacja zapisanych zrzutów (snapshotów)

## Budowanie biblioteki

    pnpm run build   # zapisuje pliki w ./built
